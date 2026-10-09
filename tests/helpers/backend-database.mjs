import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationRoot = new URL('../../supabase/migrations/', import.meta.url);
export const backendMigration = '20261009153321_backend_reward_and_access_integrity.sql';
export const owner = '11111111-1111-4111-8111-111111111111';
export const adult = '22222222-2222-4222-8222-222222222222';
export const child = '33333333-3333-4333-8333-333333333333';
export const outsider = '44444444-4444-4444-8444-444444444444';
export const workspace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const otherWorkspace = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const readMigration = (file) => readFile(new URL(file, migrationRoot), 'utf8');

export async function createBackendDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth, public to authenticated, anon, service_role;
  `);
  // Execute the real base schema and RLS. Storage, pgcrypto and Realtime are
  // Supabase services not used in these tests, so omit only those sections.
  const base = await readMigration('20260721000100_brightsteps_cloud_schema.sql');
  await db.exec(base.replace('create extension if not exists pgcrypto with schema extensions;', '')
    .split('insert into storage.buckets')[0]);
  for (const file of (await readdir(migrationRoot)).filter(file => file.endsWith('.sql')).sort().slice(1)) {
    try { await db.exec(await readMigration(file)); }
    catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  // Supabase's standard table privileges (RLS still enforces row access).
  await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated;');
  return db;
}

export async function setUser(db, id) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
export async function seed(db) {
  await db.query('insert into auth.users(id,email) values ($1,\'owner@test.invalid\'),($2,\'adult@test.invalid\'),($3,\'child@test.invalid\'),($4,\'outsider@test.invalid\')', [owner,adult,child,outsider]);
  await db.query("insert into workspaces(id,name,type,created_by) values ($1,'Family','family',$2),($3,'Other','family',$4)", [workspace,owner,otherWorkspace,outsider]);
  await db.query("insert into workspace_members(workspace_id,user_id,role) values ($1,$2,'parent'),($1,$3,'parent'),($1,$4,'child'),($5,$6,'parent')", [workspace,owner,adult,child,otherWorkspace,outsider]);
  await db.query(`insert into child_profiles(id,workspace_id,linked_user_id,name,avatar_type,avatar_value,color_key,pattern,currency_type,storage_type,starting_balance)
    values ('profile',$1,$2,'Child','preset','avatar','green','solid','coins','piggyBank',28),
      ('other-profile',$3,null,'Other','preset','avatar','green','solid','coins','piggyBank',28)`, [workspace,child,otherWorkspace]);
  await db.query("insert into reward_templates(id,workspace_id,title,cost,icon_type,icon_value) values ('reward',$1,'Reward',25,'preset','trophy')", [workspace]);
  await db.query("insert into reward_assignments(workspace_id,reward_id,profile_id) values ($1,'reward','profile')", [workspace]);
  await db.query("insert into task_templates(id,workspace_id,title,amount,frequency,icon_type,icon_value) values ('task',$1,'Daily',5,'daily','preset','task')", [workspace]);
  await db.query("insert into task_assignments(workspace_id,task_id,profile_id) values ($1,'task','profile')", [workspace]);
  await setUser(db, owner);
}
