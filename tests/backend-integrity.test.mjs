import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { createBackendDatabase, seed, setUser, owner, adult, child, outsider, workspace, otherWorkspace, readMigration, backendMigration } from './helpers/backend-database.mjs';
import { reconcileAppleEntitlement } from '../supabase/functions/_shared/entitlement-reconciliation.ts';
import { requireRemovableAdult } from '../supabase/functions/_shared/adult-access-security.ts';
import { entireAccountAction } from '../supabase/functions/delete-account/entire-account.ts';
import { createMigrationHandler } from '../supabase/functions/migrate-local-data/handler.ts';

// Execute the actual import handler against the migrated PostgreSQL schema.
function migrationAdmin() {
  return {
    async rpc(name, args) {
      assert.equal(name, 'commit_local_import');
      await db.exec('savepoint import_call');
      try {
        const result = (await db.query('select commit_local_import($1,$2,$3::jsonb,$4,$5) as result', [args.p_workspace_id,args.p_user_id,JSON.stringify(args.p_writes),args.p_payload_hash,args.p_source_version])).rows[0].result;
        await db.exec('release savepoint import_call');
        return { data: result, error: null };
      } catch (error) {
        await db.exec('rollback to savepoint import_call; release savepoint import_call');
        return { data: null, error };
      }
    },
    from(table) {
    assert.match(table, /^[a-z_]+$/);
    let columns = '*', payload, options, single = false;
    const filters = [], values = [];
    const builder = {
      select(value) { columns = value; return builder; },
      eq(key, value) { values.push(value); filters.push(`${key}=$${values.length}`); return builder; },
      in(key, list) { const placeholders = list.map(value => { values.push(value); return `$${values.length}`; }); filters.push(`${key} in (${placeholders.join(',')})`); return builder; },
      maybeSingle() { single = true; return builder; },
      upsert(rows, opts) { payload = Array.isArray(rows) ? rows : [rows]; options = opts; return builder; },
      async then(resolve, reject) {
        try {
          if (payload) {
            for (const row of payload) {
              const keys = Object.keys(row), args = Object.values(row);
              await db.query(`insert into ${table}(${keys.join(',')}) values (${args.map((_, i) => `$${i + 1}`).join(',')}) on conflict (${options.onConflict}) do nothing`, args);
            }
            resolve({ data: null, error: null });
          } else {
            const rows = (await db.query(`select ${columns} from ${table}${filters.length ? ` where ${filters.join(' and ')}` : ''}`, values)).rows;
            resolve({ data: single ? rows[0] ?? null : rows, error: null });
          }
        } catch (error) { reject(error); }
      },
    };
    return builder;
  } };
}

let db;
before(async () => { db = await createBackendDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); await seed(db); });
afterEach(async () => { await db.exec('rollback'); });
const query = async (sql, values = []) => (await db.query(sql, values)).rows;
const balance = async () => (await query("select profile_balance('profile') as balance"))[0].balance;

// Run the real Edge deletion logic against real Postgres migrations, including
// creator protection, Auth cleanup triggers, and Storage ownership metadata.
function deletionAdmin() {
  const deletedUsers = [];
  return {
    deletedUsers,
    from(table) {
      let columns = '*', sort = 'id', start = 0, end = 499;
      const predicates = [], values = [];
      const builder = {
        select(value) { columns = value; return builder; },
        eq(column, value) { values.push(value); predicates.push(`${column}=$${values.length}`); return builder; },
        order(value) { sort = value; return builder; },
        range(first, last) { start = first; end = last; return builder; },
        async then(resolve, reject) {
          try { return resolve({ data: await query(`select ${columns} from public.${table} where ${predicates.join(' and ')} order by ${sort} limit ${end-start+1} offset ${start}`, values), error: null }); }
          catch (error) { return reject(error); }
        },
      };
      return builder;
    },
    async rpc(name, args) {
      assert.equal(name, 'prepare_entire_kudos_account_deletion');
      await query('select prepare_entire_kudos_account_deletion($1,$2,$3,$4)', [args.p_user_id,args.p_owned_workspace_ids,args.p_joined_workspace_ids,args.p_apply]);
      return { error: null };
    },
    auth: { admin: {
      async getUserById(id) { return { data: { user: (await query('select * from auth.users where id=$1', [id]))[0] }, error: null }; },
      async deleteUser(id, soft) {
        assert.equal(soft, false);
        assert.equal((await query('select count(*)::int as total from storage.objects where owner=$1::uuid or owner_id=$1::uuid::text', [id]))[0].total, 0);
        await query('delete from auth.users where id=$1', [id]); deletedUsers.push(id);
        return { error: null };
      },
    } },
  };
}
const accountBody = (preview) => ({ action: 'delete_entire_account', confirm: true, expectedUserId: preview.userId, expectedWorkspaceIds: preview.ownedWorkspaces.map(item => item.id), expectedJoinedWorkspaceIds: preview.joinedWorkspaceIds });
const removeWorkspaceMedia = async (id) => { await query('delete from storage.objects where name like $1', [`${id}/%`]); };

test('entire-account preview is read-only and identifies owned versus joined workspaces', async () => {
  await query("insert into workspace_members(workspace_id,user_id,role) values ($1,$2,'parent')", [otherWorkspace,owner]);
  const preview = await entireAccountAction(deletionAdmin(), { id: owner }, { action: 'preview_entire_account', userId: outsider }, () => assert.fail('Preview removed files'));
  assert.deepEqual(preview.ownedWorkspaces.map(item => item.id), [workspace]);
  assert.deepEqual(preview.joinedWorkspaceIds, [otherWorkspace]);
  assert.equal(preview.userId, owner);
  assert.equal((await query('select count(*)::int as total from auth.users'))[0].total, 4);
});

test('entire deletion removes both owned workspaces and orphan child login, preserving joined family and other adults', async () => {
  const classroom = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await query("insert into workspaces(id,name,type,created_by) values ($1,'Class','classroom',$2)", [classroom,owner]);
  await query("insert into workspace_members(workspace_id,user_id,role) values ($1,$2,'teacher'),($3,$2,'parent')", [classroom,owner,otherWorkspace]);
  await query('update auth.users set is_anonymous=true where id=$1', [child]);
  await query("insert into storage.objects(bucket_id,name,owner,owner_id) values ('brightsteps-media',$1,$3::uuid,$3::uuid::text),('brightsteps-media',$2,$3::uuid,$3::uuid::text)", [`${workspace}/profiles/profile/photo.png`,`${otherWorkspace}/profiles/other/photo.png`,owner]);
  const admin = deletionAdmin();
  const preview = await entireAccountAction(admin, { id: owner }, { action: 'preview_entire_account' }, removeWorkspaceMedia);
  const result = await entireAccountAction(admin, { id: owner }, accountBody(preview), removeWorkspaceMedia);
  assert.equal(result.scope, 'account');
  assert.deepEqual(admin.deletedUsers, [child,owner]);
  assert.deepEqual((await query('select id from workspaces')).map(item => item.id), [otherWorkspace]);
  assert.deepEqual((await query('select id from auth.users order by id')).map(item => item.id), [adult,outsider]);
  const [photo] = await query('select name,owner,owner_id from storage.objects');
  assert.deepEqual(photo, { name: `${otherWorkspace}/profiles/other/photo.png`, owner: null, owner_id: null });
  assert.equal((await query('select count(*)::int as total from workspace_members where workspace_id=$1', [otherWorkspace]))[0].total, 1);
});

test('invited adult deleting their entire login leaves the inviting family and its profiles intact', async () => {
  const admin = deletionAdmin();
  const preview = await entireAccountAction(admin, { id: adult }, { action: 'preview_entire_account' }, removeWorkspaceMedia);
  assert.equal(preview.ownedWorkspaces.length, 0);
  await entireAccountAction(admin, { id: adult }, accountBody(preview), removeWorkspaceMedia);
  assert.deepEqual(admin.deletedUsers, [adult]);
  assert.equal((await query('select count(*)::int as total from workspaces'))[0].total, 2);
  assert.equal((await query('select count(*)::int as total from child_profiles'))[0].total, 2);
});

test('entire-account deletion rejects children and missing confirmation before any file removal', async () => {
  const admin = deletionAdmin();
  const remove = () => assert.fail('Rejected request removed files');
  await assert.rejects(entireAccountAction(admin, { id: child, is_anonymous: true }, { action: 'preview_entire_account' }, remove), /Child accounts/);
  await assert.rejects(entireAccountAction(admin, { id: child }, { action: 'preview_entire_account' }, remove), /Child accounts/);
  await assert.rejects(entireAccountAction(admin, { id: owner }, { action: 'delete_entire_account' }, remove), /not confirmed/);
});

test('changed workspace snapshot and Storage outage do not delete database accounts', async () => {
  const admin = deletionAdmin();
  const preview = await entireAccountAction(admin, { id: owner }, { action: 'preview_entire_account' }, removeWorkspaceMedia);
  await assert.rejects(entireAccountAction(admin, { id: owner }, { ...accountBody(preview), expectedWorkspaceIds: [] }, () => assert.fail('Stale confirmation removed files')), /workspaces changed/);
  await assert.rejects(entireAccountAction(admin, { id: owner }, accountBody(preview), async () => { throw new Error('Storage unavailable'); }), /Storage unavailable/);
  assert.equal((await query('select count(*)::int as total from auth.users'))[0].total, 4);
  assert.equal((await query('select count(*)::int as total from workspaces'))[0].total, 2);
});

test('authenticated users cannot call service-only entire-account deletion preparation', async () => {
  await db.exec('set local role authenticated');
  await assert.rejects(query('select prepare_entire_kudos_account_deletion($1,$2,$3,true)', [owner,[workspace],[]]), /permission denied/);
});

test('a confirmation from a different signed-in user cannot delete the current login', async () => {
  const admin = deletionAdmin();
  const preview = await entireAccountAction(admin, { id: outsider }, { action: 'preview_entire_account' }, removeWorkspaceMedia);
  const body = { ...accountBody(preview), expectedUserId: adult };
  await assert.rejects(entireAccountAction(admin, { id: outsider }, body, () => assert.fail('Wrong-user confirmation removed files')), /not confirmed/);
  assert.equal((await query('select count(*)::int as total from auth.users'))[0].total,4);
});

test('failed child Auth deletion leaves its owned workspace/profile link available for retry', async () => {
  await query('update auth.users set is_anonymous=true where id=$1',[child]);
  const admin = deletionAdmin();
  const preview = await entireAccountAction(admin, { id: owner }, { action: 'preview_entire_account' }, removeWorkspaceMedia);
  const original = admin.auth.admin.deleteUser;
  admin.auth.admin.deleteUser = async () => ({ error: new Error('Auth temporarily unavailable') });
  await assert.rejects(entireAccountAction(admin, { id: owner }, accountBody(preview), removeWorkspaceMedia), /Auth temporarily/);
  assert.equal((await query("select linked_user_id from child_profiles where id='profile'"))[0].linked_user_id,child);
  admin.auth.admin.deleteUser = original;
  await entireAccountAction(admin, { id: owner }, accountBody(preview), removeWorkspaceMedia);
  assert.deepEqual(admin.deletedUsers,[child,owner]);
});

test('deletion preview paginates memberships rather than silently truncating the account scope', async () => {
  await query("insert into workspaces(id,name,type,created_by) select ('dddddddd-dddd-4ddd-8ddd-' || lpad(n::text,12,'0'))::uuid,'Joined '||n,'family',null from generate_series(1,501) n");
  await query("insert into workspace_members(workspace_id,user_id,role) select id,$1,'parent' from workspaces where name like 'Joined %'",[adult]);
  const preview = await entireAccountAction(deletionAdmin(), { id: adult }, { action: 'preview_entire_account' }, () => assert.fail('Preview removed files'));
  assert.equal(preview.joinedWorkspaceIds.length,502);
});

test('missing safeguard migration prevents deletion before any media is touched', async () => {
  const admin = deletionAdmin();
  admin.rpc = async () => ({ error: new Error('Deletion safeguard is not deployed') });
  await assert.rejects(entireAccountAction(admin, { id: owner }, { action: 'preview_entire_account' }, () => assert.fail('Missing migration removed files')), /not deployed/);
  assert.deepEqual(admin.deletedUsers,[]);
});
const redeem = async (id, early = false, profile = 'profile') => (await query(
  "select redeem_reward($1,$2,'reward',$3,true,'2026-10-09T12:00:00Z'::timestamptz,$4) as result", [id,`delivery-${id}`,profile,early]))[0].result;

test('normal redemption charges exactly once and rejects a second unaffordable reward', async () => {
  assert.equal((await redeem('first')).balance_after, 3);
  assert.equal((await redeem('first')).already_redeemed, true);
  assert.equal(await balance(), 3);
  await assert.rejects(redeem('second'), /Insufficient balance/);
});

for (const creditAt of ['2026-10-10T12:00:00Z','2099-10-10T12:00:00Z']) {
  test(`backdated redemption cannot reuse funds earned at ${creditAt}`, async () => {
    await db.exec("update child_profiles set starting_balance=0 where id='profile'");
    await db.query("insert into currency_ledger(id,workspace_id,profile_id,amount,transaction_type,created_at) values ('earning',$1,'profile',25,'task_completion',$2)", [workspace,creditAt]);
    const result = await redeem('backdated');
    assert.equal(result.balance_after, 0);
    assert.equal(await balance(), 0);
    assert.equal((await redeem('backdated')).already_redeemed, true);
    const [record] = await query("select occurred_at,redeemed_at from reward_redemptions where id='backdated'");
    assert.equal(record.occurred_at.toISOString(), '2026-10-09T12:00:00.000Z');
    assert.ok(record.redeemed_at > new Date(creditAt));
    await db.exec('savepoint repeat_spend');
    await assert.rejects(redeem('backdated-again'), /Insufficient balance/);
    await db.exec('rollback to savepoint repeat_spend');
    assert.equal((await query('select count(*)::int as total from reward_deliveries'))[0].total, 1);
  });
}

test('backdated explicit early redemption resets funds at the accounting time, not before later earnings', async () => {
  await db.exec("update child_profiles set starting_balance=0 where id='profile'");
  await db.query("insert into currency_ledger(id,workspace_id,profile_id,amount,transaction_type,created_at) values ('earning',$1,'profile',10,'task_completion','2099-10-10')", [workspace]);
  assert.equal((await redeem('early-backdated', true)).balance_after, 0);
  assert.equal(await balance(), 0);
});

test('atomic import rolls back late writes and marker failure, and retries cannot resurrect an undone award', async () => {
  const when='2026-10-01T12:00:00.000Z';
  const state={ profiles:[{ id:'lp',name:'Atomic Child',avatar:{type:'preset',key:'avatar'},colorKey:'green',currencyType:'coins',storageType:'piggyBank',createdAt:when }],
    tasks:[{id:'lt',title:'Atomic Task',amount:10,frequency:'daily',icon:{type:'preset',value:'book'},assignedProfileIds:['lp'],completionEvents:{lp:[when]},completionAmounts:{lp:[10]},createdAt:when}], rewards:[] };
  const admin=migrationAdmin();
  let corrupt=true;
  const handler=createMigrationHandler({requireUser:async()=>({user:{id:owner}}),serviceClient:()=>({...admin,rpc:async(name,args)=>{
    if(corrupt) args.p_writes.push({table:'currency_ledger',rows:[{id:'invalid',workspace_id:workspace,profile_id:args.p_writes[0].rows[0].id,amount:'invalid-integer',transaction_type:'task_completion'}],conflict:'id'});
    return admin.rpc(name,args);
  }})});
  const call=async(sourceVersion='test')=>handler(new Request('http://localhost',{method:'POST',body:JSON.stringify({workspaceId:workspace,state,sourceVersion})}));
  assert.equal((await call()).status,400);
  assert.equal((await query("select count(*)::int as total from child_profiles where name='Atomic Child'"))[0].total,0);
  assert.equal((await query('select count(*)::int as total from migration_imports'))[0].total,0);
  corrupt=false;
  await db.exec(`create function public.test_import_marker_failure() returns trigger language plpgsql as $$begin if new.source_version='fail-marker' then raise exception 'Injected marker failure'; end if; return new; end$$;
    create trigger test_import_marker_failure before insert on public.migration_imports for each row execute function public.test_import_marker_failure();`);
  assert.equal((await call('fail-marker')).status,400);
  assert.equal((await query("select count(*)::int as total from child_profiles where name='Atomic Child'"))[0].total,0);
  assert.equal((await call()).status,200);
  const [p]=await query("select id from child_profiles where name='Atomic Child'");
  const [t]=await query("select id from task_templates where title='Atomic Task'");
  await query('select undo_task_completion($1,$2,$3::timestamptz)',[t.id,p.id,when]);
  assert.equal((await call()).status,200,'lost-response retry returns the receipt without replay');
  assert.equal((await query('select count(*)::int as total from task_completions where task_id=$1',[t.id]))[0].total,0);
  assert.equal((await query('select profile_balance($1) as balance',[p.id]))[0].balance,0);
  state.tasks[0].amount=11;
  assert.equal((await call()).status,400,'a completed payload identity cannot be replaced');
});

test('atomic import RPC is invoker-only and unavailable to adult or anonymous clients', async () => {
  const [permissions]=await query("select has_function_privilege('authenticated','commit_local_import(uuid,uuid,jsonb,text,text)','execute') as adult,has_function_privilege('anon','commit_local_import(uuid,uuid,jsonb,text,text)','execute') as anon,has_function_privilege('service_role','commit_local_import(uuid,uuid,jsonb,text,text)','execute') as service");
  assert.deepEqual(permissions,{adult:false,anon:false,service:true});
});
test('both adults use the same authoritative balance', async () => {
  await redeem('owner-purchase'); await setUser(db, adult);
  assert.equal(await balance(), 3);
  await assert.rejects(redeem('adult-purchase'), /Insufficient balance/);
});
test('explicit early redemption works with a zero balance', async () => {
  await db.exec("update child_profiles set starting_balance=0 where id='profile'");
  assert.equal((await redeem('early',true)).charged, 0);
  assert.equal(await balance(), 0);
  assert.equal((await query("select count(*)::int as total from profile_balance_resets"))[0].total, 1);
});
test('ledger balance matches client clamping after old earnings were undone', async () => {
  await db.exec("update child_profiles set starting_balance=0 where id='profile'");
  await db.query(`insert into currency_ledger(id,workspace_id,profile_id,amount,transaction_type,created_at)
    values ('earn',$1,'profile',5,'task_completion','2026-10-01'),
      ('spent',$1,'profile',-10,'reward_redemption','2026-10-02'),
      ('later',$1,'profile',3,'task_completion','2026-10-03')`, [workspace]);
  assert.equal(await balance(), 3);
});
test('early-reset boundary excludes earlier earnings but includes later earnings', async () => {
  await db.query("insert into profile_balance_resets(id,workspace_id,profile_id,reset_at) values ('reset',$1,'profile','2026-10-02')", [workspace]);
  await db.query(`insert into currency_ledger(id,workspace_id,profile_id,amount,transaction_type,created_at)
    values ('before',$1,'profile',50,'task_completion','2026-10-01'),
      ('after',$1,'profile',4,'task_completion','2026-10-03')`, [workspace]);
  assert.equal(await balance(), 4);
});

test('actual local import preserves ledger history, zero-cost redemptions and resets; undo removes the imported award', async () => {
  const first = '2026-10-01T12:00:00.000Z', reset = '2026-10-02T12:00:00.000Z', last = '2026-10-03T12:00:00.000Z';
  const state = {
    profiles: [{ id: 'local-p', name: 'Imported', avatar: { type: 'preset', key: 'avatar' }, colorKey: 'green', pattern: 'solid', currencyType: 'coins', storageType: 'piggyBank', startingBalance: 0, createdAt: first, balanceResetEvents: [reset] }],
    tasks: [{ id: 'local-t', title: 'Read', amount: 99, frequency: 'daily', icon: { type: 'preset', value: 'book' }, assignedProfileIds: ['local-p'], completionEvents: { 'local-p': [first, last] }, completionAmounts: { 'local-p': [5, 7] }, createdAt: first }],
    rewards: [{ id: 'local-r', title: 'Movie', cost: 100, icon: { type: 'preset', value: 'movie' }, assignedProfileIds: ['local-p'], redemptionEvents: { 'local-p': [reset] }, redemptionCosts: { 'local-p': [0] }, createdAt: first }],
  };
  const handler = createMigrationHandler({ requireUser: async () => ({ user: { id: owner } }), serviceClient: migrationAdmin });
  const response = await handler(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ workspaceId: workspace, state }) }));
  assert.equal(response.status, 200, await response.text());
  const [profile] = await query("select id from child_profiles where name='Imported'");
  const [task] = await query("select id from task_templates where title='Read'");
  assert.equal((await query('select profile_balance($1) as balance', [profile.id]))[0].balance, 7);
  assert.deepEqual((await query("select amount from currency_ledger where profile_id=$1 and transaction_type='task_completion' order by created_at", [profile.id])).map(row => row.amount), [5, 7]);
  assert.equal((await query('select cost from reward_redemptions where profile_id=$1', [profile.id]))[0].cost, 0);
  await query('select undo_task_completion($1,$2,$3::timestamptz)', [task.id, profile.id, last]);
  assert.equal((await query('select profile_balance($1) as balance', [profile.id]))[0].balance, 0);
  assert.equal((await query("select count(*)::int as total from currency_ledger where profile_id=$1 and transaction_type='task_completion'", [profile.id]))[0].total, 1);
});
test('deleted library reward keeps the delivered snapshot and spent coins', async () => {
  await redeem('purchase');
  await db.exec("delete from reward_templates where id='reward'");
  assert.equal(await balance(), 3);
  const [delivery] = await query("select reward_id,reward_title,status from reward_deliveries where id='delivery-purchase'");
  assert.deepEqual(delivery, {reward_id:null,reward_title:'Reward',status:'waiting'});
  assert.equal((await query('select count(*)::int as total from reward_redemptions'))[0].total, 0);
  await setUser(db,child);
  await query("select open_reward_delivery('delivery-purchase')");
  assert.equal((await query("select status from reward_deliveries"))[0].status,'opened');
});
test('child and outside adult cannot redeem or read unrelated balances', async () => {
  await db.exec('savepoint child_attempt');
  await setUser(db,child); await assert.rejects(redeem('child'), /Not authorized/);
  await db.exec('rollback to child_attempt');
  await setUser(db,outsider); await assert.rejects(balance(), /Not authorized/);
});
test('reward and profile must belong to the same workspace even with a corrupt assignment', async () => {
  await db.query("insert into reward_assignments(workspace_id,reward_id,profile_id) values ($1,'reward','other-profile')", [workspace]);
  await assert.rejects(redeem('cross',false,'other-profile'), /same workspace/);
});
test('reused delivery identifiers cannot silently spend coins', async () => {
  await redeem('first');
  await db.exec("update child_profiles set starting_balance=100 where id='profile'");
  await assert.rejects(query("select redeem_reward('second','delivery-first','reward','profile',true,now(),false)"), /identifier already used/);
});
test('a linked child can submit an assigned daily task and repeated taps reuse it', async () => {
  await setUser(db,child);
  const first = (await query("select submit_task_request('request','task','profile',now(),'2026-10-09','2026-10-09') as result"))[0].result;
  const second = (await query("select submit_task_request('another','task','profile',now(),'2026-10-09','2026-10-09') as result"))[0].result;
  assert.equal(first.status,'pending'); assert.equal(second.request_id,'request');
  assert.equal(second.already_pending,true);
});
test('historic child completion does not authorize repair of a removed assignment', async () => {
  await db.query("insert into task_completions(id,workspace_id,task_id,profile_id,period_key) values ('old',$1,'task','profile','2026-10-08')", [workspace]);
  await db.exec("delete from task_assignments where task_id='task'");
  await setUser(db,child);
  await assert.rejects(query("select submit_task_request('request','task','profile',now(),'2026-10-09','2026-10-09')"), /Task not assigned/);
});
test('archived tasks cannot be submitted by child or manager', async () => {
  await db.exec("update task_templates set archived_at=now() where id='task'");
  for (const id of [child,owner]) {
    await setUser(db,id);
    // Use a savepoint so an expected SQL exception does not abort this fixture.
    await db.exec('savepoint check_archive');
    await assert.rejects(query("select submit_task_request('request','task','profile',now(),null::text,null::date)"), /no longer assigned/);
    await db.exec('rollback to check_archive');
  }
});
test('manager child mode can still repair an active cached assignment', async () => {
  await db.exec("delete from task_assignments where task_id='task'");
  assert.equal((await query("select submit_task_request('request','task','profile',now(),null::text,null::date) as result"))[0].result.status,'pending');
});
test('legacy four-argument child request also cannot repair a revoked assignment', async () => {
  await db.exec("delete from task_assignments where task_id='task'");
  await setUser(db,child);
  await assert.rejects(query("select submit_task_request('request'::text,'task'::text,'profile'::text,now())"), /Task not assigned/);
});
test('invited adult cannot remove or demote the workspace creator via the database', async () => {
  await setUser(db,adult); await db.exec('set local role authenticated');
  await assert.rejects(db.query('delete from workspace_members where workspace_id=$1 and user_id=$2',[workspace,owner]), /creator and purchasing owner/);
});
test('ordinary invited adults remain removable', async () => {
  await db.query('delete from workspace_members where workspace_id=$1 and user_id=$2',[workspace,adult]);
  assert.equal((await query('select count(*)::int as total from workspace_members where user_id=$1',[adult]))[0].total,0);
});
test('creator attribution cannot be rewritten to bypass adult-removal protection', async () => {
  await setUser(db,adult); await db.exec('set local role authenticated');
  await assert.rejects(db.query('update workspaces set created_by=$1 where id=$2',[adult,workspace]), /ownership cannot be changed/);
});
test('creator cannot be demoted but ordinary workspace settings still work', async () => {
  await db.exec('savepoint before_demotion');
  await assert.rejects(db.query("update workspace_members set role='child' where workspace_id=$1 and user_id=$2",[workspace,owner]), /creator and purchasing owner/);
  await db.exec('rollback to before_demotion');
  await setUser(db,adult); await db.exec('set local role authenticated');
  await db.query("update workspaces set name='New family name' where id=$1",[workspace]);
  assert.equal((await query('select name from workspaces where id=$1',[workspace]))[0].name,'New family name');
});
test('legacy six-argument reward redemption still charges only the reward cost', async () => {
  const result=(await query("select redeem_reward('legacy','legacy-delivery','reward','profile',true,now()) as result"))[0].result;
  assert.equal(result.balance_after,3);
});
test('real Auth-account deletion still succeeds with another adult remaining', async () => {
  await db.query('delete from auth.users where id=$1',[owner]);
  assert.equal((await query('select created_by from workspaces where id=$1',[workspace]))[0].created_by,null);
});
test('deleting the last adult account still removes its workspace', async () => {
  await db.query('delete from workspace_members where user_id=$1',[adult]);
  await db.query('delete from auth.users where id=$1',[owner]);
  assert.equal((await query('select id from workspaces where id=$1',[workspace])).length,0);
});
test('empty StoreKit list never revokes a purchased lifetime entitlement', async () => {
  await db.query("update workspace_entitlements set status='lifetime',lifetime_unlocked_at=now(),source_transaction_id='tx',source_ownership_type='PURCHASED' where workspace_id=$1",[workspace]);
  assert.equal((await query('select revoke_missing_apple_entitlement($1,$2) as revoked',[workspace,owner]))[0].revoked,0);
});
test('missing family-shared access can expire without affecting another owner', async () => {
  await db.exec("update workspace_entitlements set status='lifetime',lifetime_unlocked_at=now(),source_ownership_type='FAMILY_SHARED'");
  assert.equal((await query('select revoke_missing_apple_entitlement($1,$2) as revoked',[workspace,owner]))[0].revoked,1);
  assert.equal((await query('select status from workspace_entitlements where workspace_id=$1',[otherWorkspace]))[0].status,'lifetime');
});
test('verified revocation affects only its exact transaction', async () => {
  await db.query("update workspace_entitlements set status='lifetime',lifetime_unlocked_at=now(),source_transaction_id='tx',source_ownership_type='PURCHASED' where workspace_id=$1",[workspace]);
  assert.equal((await query("select revoke_verified_app_store_entitlement($1,$2,'other-tx') as revoked",[workspace,owner]))[0].revoked,0);
  assert.equal((await query("select revoke_verified_app_store_entitlement($1,$2,'tx') as revoked",[workspace,owner]))[0].revoked,1);
});
test('authenticated clients cannot directly invoke purchase revocation RPCs', async () => {
  await db.exec('set local role authenticated');
  await assert.rejects(query("select revoke_verified_app_store_entitlement($1,$2,'tx')",[workspace,owner]), /permission denied/);
});
test('per-profile redemption lock precedes balance reads and all ledger/reset writers lock', async () => {
  // PGlite has one connection; this verifies deployed locking definitions,
  // not a substitute for the two-device race test documented for development.
  const sql = await readMigration(backendMigration);
  const redemption = sql.split('create function public.redeem_reward(')[1].split('create function public.submit_task_request')[0];
  assert.ok(redemption.indexOf('for no key update') < redemption.indexOf('public.profile_balance('));
  const rows = await query("select tgname from pg_trigger where tgname in ('currency_ledger_balance_lock','profile_balance_resets_balance_lock')");
  assert.equal(rows.length,2);
});

function fakeAdmin(entitlement, workspaceData = {created_by:owner}) {
  const calls = [];
  return {calls,from(table) {
    const builder = {select(){return builder},eq(){return builder},async maybeSingle(){
      return {data:table==='workspaces'?workspaceData:entitlement,error:null};
    }}; return builder;
  },async rpc(name,args){calls.push({name,args});return {error:null}}};
}
const direct = {status:'lifetime',source_ownership_type:'PURCHASED',source_transaction_id:'tx'};
const verified = {bundleId:'app',productId:'lifetime',transactionId:'tx'};
test('direct purchase survives an Apple lookup outage in the actual reconciliation helper', async () => {
  const admin=fakeAdmin(direct);
  await reconcileAppleEntitlement(admin,workspace,owner,'app','lifetime',async()=>{throw Error('offline')});
  assert.equal(admin.calls.length,0);
});
test('confirmed direct purchase remains active and only a matching revocation is forwarded', async () => {
  const admin=fakeAdmin(direct);
  await reconcileAppleEntitlement(admin,workspace,owner,'app','lifetime',async()=>verified);
  assert.equal(admin.calls.length,0);
  await reconcileAppleEntitlement(admin,workspace,owner,'app','lifetime',async()=>({...verified,revocationDate:123}));
  assert.equal(admin.calls[0].name,'revoke_verified_app_store_entitlement');
  assert.equal(admin.calls[0].args.p_transaction_id,'tx');
});
test('mismatched Apple response cannot revoke a direct purchase', async () => {
  const admin=fakeAdmin(direct);
  await reconcileAppleEntitlement(admin,workspace,owner,'app','lifetime',async()=>({...verified,transactionId:'wrong',revocationDate:123}));
  assert.equal(admin.calls.length,0);
});
test('shared reconciliation continues using the shared-only database path', async () => {
  const admin=fakeAdmin({...direct,source_ownership_type:'FAMILY_SHARED'});
  await reconcileAppleEntitlement(admin,workspace,owner,'app','lifetime',async()=>{throw Error('must not look up')});
  assert.equal(admin.calls[0].name,'revoke_missing_apple_entitlement');
});
test('adult-removal helper rejects creator and billing owner but permits invited adult', async () => {
  const admin=fakeAdmin({billing_owner_id:owner});
  await assert.rejects(requireRemovableAdult(admin,workspace,owner), /cannot be removed/);
  await requireRemovableAdult(admin,workspace,adult);
});
