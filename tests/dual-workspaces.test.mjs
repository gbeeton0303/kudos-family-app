import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Teacher Mode switches real family and classroom workspaces', async () => {
  const app = await read('../App.tsx');
  const settings = await read('../src/screens/SettingsScreen.tsx');
  assert.match(app, /onWorkspaceTypeChange\(enabled \? 'classroom' : 'family'\)/);
  assert.match(app, /workspaces\.selectWorkspace\(existing\.workspaceId\)/);
  assert.match(app, /createWorkspace\(name, workspaceToCreate\)/);
  assert.match(app, /key=\{`\$\{auth\.user\.id\}:\$\{workspaces\.selected\.workspaceId\}`\}/);
  assert.match(settings, /Switch to your separate classroom workspace/);
  assert.match(settings, /Switch back to your separate family workspace/);
});

test('workspace settings expose separate family and classroom names', async () => {
  const modal = await read('../src/components/CloudAccountModal.tsx');
  assert.match(modal, /manager && section === 'workspaces'/);
  assert.match(modal, /\(\['family', 'classroom'\] as WorkspaceType\[\]\)\.map/);
  assert.match(modal, /await renameWorkspace\(workspace\.workspaceId, nextValue\)/);
  assert.match(modal, /await createWorkspace\(nextValue, type\)/);
  assert.match(modal, /Your other workspace will not be affected/);
});

test('database creates one owned workspace per type without weakening child boundaries', async () => {
  const migration = await read('../supabase/migrations/20260927183149_dual_family_classroom_workspaces.sql');
  assert.match(migration, /Child accounts cannot create a family or classroom/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where created_by = v_user_id and type = p_type/);
  assert.match(migration, /case when p_type = 'classroom' then 'teacher' else 'parent' end/);
  assert.match(migration, /grant execute on function public\.create_workspace\(text, text\) to authenticated/);
});

test('one verified lifetime purchase unlocks both workspaces owned by the purchaser', async () => {
  const migration = await read('../supabase/migrations/20260927183149_dual_family_classroom_workspaces.sql');
  const purchase = await read('../src/screens/PurchaseAccessScreen.tsx');
  assert.match(migration, /where w\.created_by = p_purchaser_user_id/);
  assert.match(migration, /w\.created_by = new\.created_by/);
  assert.match(migration, /v_existing_purchaser is distinct from p_purchaser_user_id/);
  assert.match(migration, /status = 'lifetime'/);
  assert.match(purchase, /both family and classroom workspaces created by this adult account/);
});

test('child accounts cannot switch workspaces or see the creation dialog', async () => {
  const app = await read('../App.tsx');
  assert.match(app, /if \(childAccount \|\| workspaces\.selected\?\.workspaceType === type\) return/);
  assert.match(app, /if \(cloudChild\) return/);
  assert.match(app, /workspaceSwitchingEnabled=\{Boolean\(cloudAccess && !cloudChild\)\}/);
});
