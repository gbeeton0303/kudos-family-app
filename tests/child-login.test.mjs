import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { normalizeChildUsername, childLoginAddress, validateChildPassword, isChildIdentity } from '../src/cloud/childIdentity.ts';
import { performAuthEntry } from '../src/cloud/authEntry.ts';
import { childLoginAction } from '../supabase/functions/profile-invite/child-login.ts';
import { createBackendDatabase, seed, setUser, child, owner, outsider, workspace } from './helpers/backend-database.mjs';
let db;
before(async () => { db=await createBackendDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); await seed(db); await db.query('update auth.users set is_anonymous=true where id=$1',[child]); });
afterEach(async () => { await db.exec('rollback'); });
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function denied(sql,args,pattern) {
  await db.exec('savepoint denied_operation');
  await assert.rejects(db.query(sql,args),pattern);
  await db.exec('rollback to savepoint denied_operation');
}
function admin() {
  const updates=[];
  return { updates,
    from(table) {
      let columns='*'; const predicates=[],args=[];
      const q={ select(value){columns=value; return q;}, eq(key,value){args.push(value);predicates.push(`${key}=$${args.length}`);return q;}, async maybeSingle(){return {data:(await rows(`select ${columns} from public.${table} where ${predicates.join(' and ')}`,args))[0],error:null};} };
      return q;
    },
    async rpc(name,args) { assert.equal(name,'prepare_child_login'); await db.query('select prepare_child_login($1)',[args.p_user_id]);return {error:null}; },
    auth:{admin:{
      async getUserById(id){const u=(await rows('select * from auth.users where id=$1',[id]))[0];return {data:{user:u&&{...u,app_metadata:u.raw_app_meta_data,user_metadata:u.raw_user_meta_data}},error:null};},
      async updateUserById(id,attributes){updates.push({id,attributes}); await db.query('update auth.users set email=$2,is_anonymous=false,raw_app_meta_data=$3,raw_user_meta_data=$4 where id=$1',[id,attributes.email,JSON.stringify(attributes.app_metadata),JSON.stringify(attributes.user_metadata)]);return {error:null};},
    }},
  };
}
test('child username normalization and internal address require no child email',()=>{
  assert.equal(normalizeChildUsername(' Happy_Star27 '),'happy_star27');
  assert.equal(childLoginAddress('Happy_Star27'),'kudos-child-happy_star27@child-login.invalid');
  for(const invalid of ['', 'abc', 'name@example.com','first last','1234','a'.repeat(25)]) assert.throws(()=>normalizeChildUsername(invalid));
  assert.throws(()=>validateChildPassword('short')); validateChildPassword('password123');
});
test('child sign-in uses no adult registration, invitation or consent',async()=>{
  const calls=[];
  await performAuthEntry('child-signin',{username:' Star_27 ',email:'',password:'password123',inviteCode:'',displayName:'',legalAccepted:false},{signInChild:async(...args)=>calls.push(args)});
  assert.deepEqual(calls,[['star_27','password123']]);
});
test('upgrade preserves profile identity, balance, assignments and history',async()=>{
  await rows("insert into task_completions(id,workspace_id,task_id,profile_id,period_key) values ('completed',$1,'task','profile','2026-10-10')",[workspace]);
  const before=await rows("select profile_balance('profile') balance");
  const api=admin();
  await childLoginAction(api,{id:child,is_anonymous:true},{action:'set-child-login',username:'star_27',password:'password123'});
  assert.equal(api.updates[0].id,child); assert.equal(api.updates[0].attributes.email_confirm,true);
  assert.deepEqual(await rows("select profile_balance('profile') balance"),before);
  assert.equal((await rows("select linked_user_id from child_profiles where id='profile'"))[0].linked_user_id,child);
  assert.equal((await rows('select count(*)::int total from task_assignments'))[0].total,1);
});
test('trusted child classification survives conversion and malicious metadata edits',async()=>{
  await rows('select prepare_child_login($1)',[child]);
  await rows("update auth.users set is_anonymous=false,raw_app_meta_data='{}',raw_user_meta_data='{\"account_type\":\"adult\"}' where id=$1",[child]);
  const [u]=await rows('select * from auth.users where id=$1',[child]);
  assert.equal(u.raw_app_meta_data.account_type,'child'); assert.equal(u.raw_user_meta_data.account_type,'child');
  assert.equal(isChildIdentity({is_anonymous:false,app_metadata:u.raw_app_meta_data}),true);
});
test('permanent child cannot create a workspace, even through the older RPC',async()=>{
  await rows('select prepare_child_login($1)',[child]); await rows('update auth.users set is_anonymous=false where id=$1',[child]);
  await setUser(db,child);
  await denied("select create_workspace('Forbidden','classroom')",[],/Child accounts/);
  await denied("insert into workspaces(name,type,created_by) values ('Forbidden','family',$1)",[child],/Child accounts/);
});
test('permanent child cannot gain adult membership, even through service upsert',async()=>{
  await rows('select prepare_child_login($1)',[child]); await rows('update auth.users set is_anonymous=false where id=$1',[child]);
  await denied("update workspace_members set role='parent' where user_id=$1",[child],/Child accounts/);
});
test('child remains classified after removal of its linked membership',async()=>{
  await rows('select prepare_child_login($1)',[child]); await rows('update auth.users set is_anonymous=false where id=$1',[child]);
  await rows('delete from workspace_members where user_id=$1',[child]);
  await denied('select prepare_child_login($1)',[child],/no longer linked/);
  assert.equal((await rows('select is_kudos_child_identity($1) child',[child]))[0].child,true);
});
test('an adult cannot disguise itself using editable child metadata',async()=>{
  await rows("update auth.users set raw_user_meta_data='{\"account_type\":\"child\"}' where id=$1",[owner]);
  const api=admin();
  await assert.rejects(childLoginAction(api,{id:owner,is_anonymous:false,user_metadata:{account_type:'child'}},{action:'set-child-login',username:'star_27',password:'password123'}),/adult login/);
  assert.equal(api.updates.length,0);
});
test('only the child’s own parent or teacher can reset its login',async()=>{
  const api=admin();
  await assert.rejects(childLoginAction(api,{id:outsider},{action:'reset-child-login',profileId:'profile',username:'star_27',password:'password123'}),/parent or teacher/);
  assert.equal(api.updates.length,0);
  await childLoginAction(api,{id:owner},{action:'reset-child-login',profileId:'profile',username:'star_27',password:'password123'});
  assert.equal(api.updates[0].id,child);
});
test('parent reset refuses a historical link to an adult Auth user',async()=>{
  await rows('update child_profiles set linked_user_id=$1 where id=\'profile\'',[outsider]);
  const api=admin();
  await assert.rejects(childLoginAction(api,{id:owner},{action:'reset-child-login',profileId:'profile',username:'star_27',password:'password123'}),/adult login/);
  assert.equal(api.updates.length,0);
});
test('self setup cannot overwrite an already permanent child login',async()=>{
  const api=admin();
  await assert.rejects(childLoginAction(api,{id:child,is_anonymous:false,app_metadata:{account_type:'child'}},{action:'set-child-login',username:'star_27',password:'password123'}),/already set up/);
  assert.equal(api.updates.length,0);
});
test('failed Auth update keeps a child restricted and allows a safe retry',async()=>{
  const api=admin(); api.auth.admin.updateUserById=async()=>({error:{message:'email already registered'}});
  await assert.rejects(childLoginAction(api,{id:child,is_anonymous:true},{action:'set-child-login',username:'star_27',password:'password123'}),/username is unavailable/);
  assert.equal((await rows('select is_kudos_child_identity($1) child',[child]))[0].child,true);
  await childLoginAction(admin(),{id:child,is_anonymous:true},{action:'set-child-login',username:'another_star',password:'password123'});
});
test('deleting the permanent login revokes the link but preserves earned points',async()=>{
  await childLoginAction(admin(),{id:child,is_anonymous:true},{action:'set-child-login',username:'star_27',password:'password123'});
  const before=await rows("select profile_balance('profile') balance");
  await rows('delete from auth.users where id=$1',[child]);
  assert.equal((await rows("select linked_user_id from child_profiles where id='profile'"))[0].linked_user_id,null);
  assert.deepEqual(await rows("select profile_balance('profile') balance"),before);
});
test('child-login preparation is service-only and cannot be invoked by a client',async()=>{
  const [p]=await rows("select has_function_privilege('authenticated','public.prepare_child_login(uuid)','execute') allowed");
  assert.equal(p.allowed,false);
  assert.equal((await rows("select has_function_privilege('service_role','public.prepare_child_login(uuid)','execute') allowed"))[0].allowed,true);
});
test('permanent child still sees only its own profile through real RLS',async()=>{
  await childLoginAction(admin(),{id:child,is_anonymous:true},{action:'set-child-login',username:'star_27',password:'password123'});
  await setUser(db,child); await db.exec('set local role authenticated');
  assert.deepEqual((await rows('select id from child_profiles')).map(p=>p.id),['profile']);
  assert.equal((await rows('select count(*)::int count from workspaces'))[0].count,1);
});
test('unlinked permanent child cannot use entire-account deletion',async()=>{
  await rows('select prepare_child_login($1)',[child]); await rows('update auth.users set is_anonymous=false where id=$1',[child]);
  await rows('delete from workspace_members where user_id=$1',[child]);
  await denied('select prepare_entire_kudos_account_deletion($1,$2,$3,false)',[child,[],[]],/Only an adult/);
});
test('adult cannot reserve a child’s internal login address through signup',async()=>{
  await denied('insert into auth.users(id,email) values (gen_random_uuid(),$1)',['kudos-child-reserved@child-login.invalid'],/reserved/);
});
test('new and older adult privacy acceptance versions are recorded',async()=>{
  for (const version of ['2026-09-06','2026-10-10']) {
    const [u]=await rows("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'adult-acceptance@test.invalid',$1) returning id",[JSON.stringify({account_type:'adult',legal_terms_version:'2026-09-06',legal_privacy_version:version})]);
    assert.equal((await rows('select privacy_version from legal_acceptances where user_id=$1',[u.id]))[0].privacy_version,version);
  }
});
