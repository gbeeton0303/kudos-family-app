import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('database contract prevents duplicate task completions per task, profile, and period', async () => {
  const schema = await read('../supabase/migrations/20260721000100_brightsteps_cloud_schema.sql');
  assert.match(schema, /unique\s*\(task_id,\s*profile_id,\s*period_key\)/i);
  assert.match(schema, /primary key\s*\(workspace_id,\s*user_id\)/i);
});

test('atomic award migration self-heals missing credit for direct and approved completions', async () => {
  const migration = await read('../supabase/migrations/20260826000100_atomic_task_awards_and_assignment_repair.sql');
  assert.match(migration, /ensure_task_completion_credit\(v_completion_id\)/i);
  assert.match(migration, /review_task_request[\s\S]*ensure_task_completion_credit\(v_completion_id\)/i);
  assert.match(migration, /not exists\s*\([\s\S]*transaction_type\s*=\s*'task_completion'[\s\S]*source_id\s*=\s*c\.id/i);
});

test('task action routes approval, denial, request, and undo through server RPCs', async () => {
  const edgeFunction = await read('../supabase/functions/task-action/index.ts');
  assert.match(edgeFunction, /action === 'undo'[\s\S]*rpc\('undo_task_completion'/);
  assert.match(edgeFunction, /action === 'request'[\s\S]*rpc\('submit_task_request'/);
  assert.match(edgeFunction, /action === 'approve' \|\| action === 'deny'[\s\S]*rpc\('review_task_request'/);
});

test('critical task writes use database RPCs directly and treat push delivery as optional', async () => {
  const repository = await read('../src/cloud/repository.ts');
  assert.match(repository, /submitTaskRequestConfirmed[\s\S]*rpc\('submit_task_request'/);
  assert.match(repository, /undoTaskConfirmed[\s\S]*rpc\('undo_task_completion'/);
  assert.match(repository, /reviewTaskRequestConfirmed[\s\S]*rpc\('review_task_request'/);
  assert.match(repository, /case 'request_task': return submitTaskRequestConfirmed/);
  assert.match(repository, /void performTaskAction\(\{ action: 'notify-request'/);
});

test('a stale local reward balance falls back to the approved early-redemption path', async () => {
  const repository = await read('../src/cloud/repository.ts');
  assert.match(repository, /insufficient balance[\s\S]*p_allow_early:\s*true/i);
  assert.match(repository, /using the existing early-redemption path/i);
});

test('repeat daily awards use a manager-only RPC while normal completions keep their period lock', async () => {
  const migration = await read('../supabase/migrations/20260908000100_manager_repeat_daily_task_completions.sql');
  const repository = await read('../src/cloud/repository.ts');
  const profile = await read('../src/screens/ProfileDetailScreen.tsx');
  assert.match(migration, /complete_daily_task_again/);
  assert.match(migration, /is_workspace_manager\(v_task\.workspace_id\)/);
  assert.match(migration, /v_task\.frequency <> 'daily'/);
  assert.match(migration, /ensure_task_completion_credit\(v_completion_id\)/);
  assert.match(migration, /v_period \|\| ':repeat:' \|\| p_event_id/);
  assert.match(repository, /payload\.allowRepeatDaily \? 'complete_daily_task_again' : 'complete_task_direct'/);
  assert.match(profile, /const canRepeatDaily = isParent && task\.frequency === 'daily' && completed && !pending/);
  assert.match(profile, /Are you sure you'd like to complete again\?/);
});

test('native splash uses edge-to-edge Kudos artwork on the matching dark-teal background', async () => {
  const config = JSON.parse(await read('../app.json'));
  assert.equal(config.expo.splash.image, './assets/splash-kudos-fullscreen.png');
  assert.equal(config.expo.splash.resizeMode, 'cover');
  assert.equal(config.expo.splash.backgroundColor, '#003F42');
});

test('task removal archives templates and preserves completion-backed earnings', async () => {
  const migration = await read('../supabase/migrations/20260909000100_preserve_task_history_on_removal.sql');
  const repository = await read('../src/cloud/repository.ts');
  assert.match(migration, /add column if not exists archived_at timestamptz/i);
  assert.match(migration, /delete from public\.task_assignments/i);
  assert.match(migration, /task_completions_task_id_fkey[\s\S]*on delete restrict/i);
  assert.match(repository, /from\('task_templates'\)\.update\(\{ archived_at:/);
  assert.match(repository, /orphanedTaskHistory/);
  assert.match(repository, /taskAwardByCompletionId/);
  assert.match(repository, /row\.amount > 0/);
});

test('task requests authorize both linked child logins and managers using Child Mode', async () => {
  const migration = await read('../supabase/migrations/20260830000100_allow_manager_child_mode_task_requests.sql');
  assert.match(migration, /v_is_linked_child\s*:=\s*public\.is_linked_profile\(p_profile_id\)/i);
  assert.match(migration, /v_is_manager\s*:=\s*public\.is_workspace_manager\(v_task\.workspace_id\)/i);
  assert.match(migration, /if not v_is_linked_child and not v_is_manager then/i);
  assert.match(migration, /v_profile\.workspace_id\s*<>\s*v_task\.workspace_id/i);
});

test('cloud task completion is optimistic, persistent, and retried after reconnect', async () => {
  const hook = await read('../src/hooks/useCloudFamilyData.ts');
  const completionStart = hook.indexOf('const completeTask = useCallback');
  const completionEnd = hook.indexOf('const undoTaskCompletion', completionStart);
  const completion = hook.slice(completionStart, completionEnd);
  assert.ok(completion.indexOf('updateFamily(') < completion.indexOf('enqueue({'), 'local completion must be applied before it is queued');
  assert.match(completion, /type: 'complete_task'/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /setInterval\(retryWhenAvailable, 12_000\)/);
  assert.match(hook, /AsyncStorage\.setItem\(queueKey\(workspaceId\)/);
});

test('workspace membership is cached so an authenticated family can cold-launch offline', async () => {
  const workspaces = await read('../src/cloud/workspaces.ts');
  const accessHook = await read('../src/cloud/useWorkspaceAccess.ts');
  assert.match(workspaces, /WORKSPACE_ACCESS_CACHE_PREFIX/);
  assert.match(workspaces, /saveCachedWorkspaceAccess\(userId, (?:allowedAccess|access)\)/);
  assert.match(accessHook, /loadCachedWorkspaceAccess\(user\.id(?:, childOnly)?\)/);
  assert.match(accessHook, /setSelected\(cached\.find/);
});

test('multiple adults retain manager access through workspace membership checks', async () => {
  const adultFunction = await read('../supabase/functions/adult-invite/index.ts');
  const schema = await read('../supabase/migrations/20260721000100_brightsteps_cloud_schema.sql');
  assert.match(adultFunction, /\['parent', 'teacher'\]\.includes\(data\.role\)/);
  assert.match(schema, /role text not null check \(role in \('parent', 'teacher', 'child'\)\)/i);
});

test('child device replacement requires a manager and revokes old auth before issuing a code', async () => {
  const profileFunction = await read('../supabase/functions/profile-invite/index.ts');
  const inviteMigration = await read('../supabase/migrations/20260827000200_require_anonymous_child_invites.sql');
  const managerCheck = profileFunction.indexOf("!['parent', 'teacher'].includes(membership.role)");
  const deleteOldUser = profileFunction.indexOf('admin.auth.admin.deleteUser(profile.linked_user_id)');
  const createInvite = profileFunction.indexOf("admin.from('profile_invites').insert");
  assert.ok(managerCheck >= 0, 'replacement must check the manager role');
  assert.ok(deleteOldUser > managerCheck, 'old child auth must be deleted after authorization');
  assert.ok(createInvite > deleteOldUser, 'replacement code must be created only after old access is revoked');
  assert.match(profileFunction, /if \(!user\.is_anonymous\) throw new Error\('A child code can only be used/);
  assert.match(profileFunction, /if \(oldAccount\.user\?\.is_anonymous\)[\s\S]*deleteUser\(profile\.linked_user_id\)/);
  assert.match(inviteMigration, /from auth\.users[\s\S]*is_anonymous is true/i);
});

test('new adult acceptance stores versioned legal documents with a server timestamp', async () => {
  const migration = await read('../supabase/migrations/20260827000100_legal_acceptance_records.sql');
  assert.match(migration, /terms_version text not null/);
  assert.match(migration, /privacy_version text not null/);
  assert.match(migration, /accepted_at timestamptz not null default now\(\)/);
  assert.match(migration, /after insert on auth\.users/i);
});

test('signup confirmation and password recovery use distinct callback flows', async () => {
  const auth = await read('../src/cloud/AuthContext.tsx');
  assert.match(auth, /emailRedirectTo:\s*'kudosfamily:\/\/auth-callback\?flow=signup'/);
  assert.match(auth, /redirectTo:\s*'kudosfamily:\/\/auth-callback\?flow=recovery'/);
  assert.match(auth, /setIsRecoveringPassword\(authFlow === 'recovery'\)/);
});

test('adult invitation acceptance survives confirmation and is idempotent', async () => {
  const workspaces = await read('../src/cloud/workspaces.ts');
  const adultFunction = await read('../supabase/functions/adult-invite/index.ts');
  assert.match(workspaces, /user_metadata\?\.adult_invite_code/);
  assert.match(workspaces, /removeItem\(PENDING_ADULT_INVITE_KEY\)/);
  assert.match(workspaces, /adult_invite_code:\s*null/);
  assert.match(adultFunction, /invitation\.accepted_by === user\.id[\s\S]*already_accepted:\s*true/);
});

test('child account setup requires anonymous auth in every Supabase environment', async () => {
  const config = await read('../supabase/config.toml');
  const auth = await read('../src/cloud/AuthContext.tsx');
  assert.match(config, /enable_anonymous_sign_ins\s*=\s*true/);
  assert.match(auth, /Enable Anonymous Sign-Ins in the Supabase Authentication settings/);
});

test('child signup refreshes access and can never route to adult onboarding', async () => {
  const auth = await read('../src/cloud/AuthContext.tsx');
  const app = await read('../App.tsx');
  const workspaces = await read('../src/cloud/workspaces.ts');
  assert.match(auth, /acceptProfileInvite\(inviteCode\)[\s\S]*auth\.refreshSession\(\)/);
  assert.match(app, /childAccount && workspaces\.selected\?\.role !== 'child'[\s\S]*ChildAccountStatusScreen/);
  assert.match(app, /ChildAccountStatusScreen[\s\S]*WorkspaceOnboardingScreen/);
  assert.match(workspaces, /item\.role === 'child' && Boolean\(item\.linkedProfileId\)/);
});

test('database prevents anonymous child accounts from becoming workspace managers', async () => {
  const migration = await read('../supabase/migrations/20260901000100_enforce_child_account_boundaries.sql');
  assert.match(migration, /auth\.users[\s\S]*is_anonymous is true[\s\S]*Child accounts cannot create/i);
  assert.match(migration, /delete from public\.workspace_members[\s\S]*au\.is_anonymous is true[\s\S]*wm\.role in \('parent','teacher'\)/i);
});

test('account deletion constraints cannot strand Auth users or sole-manager workspaces', async () => {
  const migration = await read('../supabase/migrations/20260901000200_auth_user_deletion_integrity.sql');
  assert.match(migration, /workspaces_created_by_fkey[\s\S]*on delete set null/i);
  assert.match(migration, /profile_invites_created_by_fkey[\s\S]*on delete set null/i);
  assert.match(migration, /before delete on auth\.users/i);
  assert.match(migration, /other_manager[\s\S]*role in \('parent', 'teacher'\)/i);
});

test('family deletion removes storage first and hard-deletes every account without another workspace', async () => {
  const edgeFunction = await read('../supabase/functions/delete-account/index.ts');
  const storageDelete = edgeFunction.indexOf('await deleteMediaPrefix(workspaceId)');
  const accountDelete = edgeFunction.indexOf('admin.auth.admin.deleteUser(accountUserId, false)');
  assert.ok(storageDelete >= 0 && accountDelete > storageDelete, 'workspace media must be removed before Auth accounts');
  assert.match(edgeFunction, /usersWithOtherWorkspaces/);
  assert.match(edgeFunction, /workspaceUserIds[\s\S]*members[\s\S]*linkedProfiles/);
  assert.match(edgeFunction, /accountRetained:\s*currentAccountRetained/);
});
