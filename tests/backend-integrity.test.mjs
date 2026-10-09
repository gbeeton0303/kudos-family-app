import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { createBackendDatabase, seed, setUser, owner, adult, child, outsider, workspace, otherWorkspace, readMigration, backendMigration } from './helpers/backend-database.mjs';
import { reconcileAppleEntitlement } from '../supabase/functions/_shared/entitlement-reconciliation.ts';
import { requireRemovableAdult } from '../supabase/functions/_shared/adult-access-security.ts';

let db;
before(async () => { db = await createBackendDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); await seed(db); });
afterEach(async () => { await db.exec('rollback'); });
const query = async (sql, values = []) => (await db.query(sql, values)).rows;
const balance = async () => (await query("select profile_balance('profile') as balance"))[0].balance;
const redeem = async (id, early = false, profile = 'profile') => (await query(
  "select redeem_reward($1,$2,'reward',$3,true,'2026-10-09T12:00:00Z'::timestamptz,$4) as result", [id,`delivery-${id}`,profile,early]))[0].result;

test('normal redemption charges exactly once and rejects a second unaffordable reward', async () => {
  assert.equal((await redeem('first')).balance_after, 3);
  assert.equal((await redeem('first')).already_redeemed, true);
  assert.equal(await balance(), 3);
  await assert.rejects(redeem('second'), /Insufficient balance/);
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
