import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireSupabase } from './supabase';
import type { WorkspaceAccess, WorkspaceType } from './types';

const SELECTED_WORKSPACE_KEY = '@brightsteps/cloud-selected-workspace-v1';
const PENDING_ADULT_INVITE_KEY = '@kudos/pending-adult-invite-v1';
const WORKSPACE_ACCESS_CACHE_PREFIX = '@kudos/workspace-access-v1';

function workspaceAccessCacheKey(userId: string) {
  return `${WORKSPACE_ACCESS_CACHE_PREFIX}/${userId}`;
}

function childOnlyAccess(access: WorkspaceAccess[]) {
  return access.filter((item) => item.role === 'child' && Boolean(item.linkedProfileId));
}

export async function loadCachedWorkspaceAccess(userId: string, childOnly = false): Promise<WorkspaceAccess[]> {
  const value = await AsyncStorage.getItem(workspaceAccessCacheKey(userId));
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    const access = Array.isArray(parsed) ? parsed as WorkspaceAccess[] : [];
    return childOnly ? childOnlyAccess(access) : access;
  } catch {
    return [];
  }
}

export async function saveCachedWorkspaceAccess(userId: string, access: WorkspaceAccess[]) {
  await AsyncStorage.setItem(workspaceAccessCacheKey(userId), JSON.stringify(access));
}

function cloudErrorText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value instanceof Error && value.message && value.message !== '[object Object]') return value.message;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'details', 'hint', 'code']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (candidate && typeof candidate === 'object') {
        const nested = cloudErrorText(candidate, '');
        if (nested) return nested;
      }
    }
  }
  return fallback;
}

async function throwFunctionError(error: unknown, functionName: string): Promise<never> {
  const candidate = error as { context?: Response };
  let detail = cloudErrorText(error, `${functionName} could not be reached.`);
  const response = candidate?.context;
  if (response && typeof response.clone === 'function') {
    try {
      detail = cloudErrorText(await response.clone().json(), detail);
    } catch {
      try {
        const text = await response.clone().text();
        if (text.trim()) detail = text.trim();
      } catch { /* keep the best message already found */ }
    }
  }
  if (/requested function was not found|function.*not found/i.test(detail)) {
    throw new Error(`Kudos Cloud is missing the ${functionName} Edge Function in this environment. Deploy the latest production functions and try again.`);
  }
  throw new Error(detail);
}

export async function saveChildLogin(username: string, password: string, profileId?: string) {
  const { data, error } = await requireSupabase().functions.invoke('profile-invite', { body: {
    action: profileId ? 'reset-child-login' : 'set-child-login', username, password, profileId,
  } });
  if (error) await throwFunctionError(error, 'profile-invite');
  if (data?.error) throw new Error(data.error);
  if (!data?.data?.saved) throw new Error('Child login was not saved. Update the profile-invite function and try again.');
}

export async function loadWorkspaceAccess(userId: string, childOnly = false): Promise<WorkspaceAccess[]> {
  const client = requireSupabase();
  const { data: memberships, error } = await client
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId);
  if (error) throw error;
  if (!memberships?.length) {
    await saveCachedWorkspaceAccess(userId, []);
    return [];
  }

  const ids = memberships.map((item) => item.workspace_id);
  const [{ data: workspaces, error: workspaceError }, { data: linkedProfiles, error: profileError }] = await Promise.all([
    client.from('workspaces').select('id, name, type').in('id', ids),
    client.from('child_profiles').select('id, workspace_id').eq('linked_user_id', userId),
  ]);
  if (workspaceError) throw workspaceError;
  if (profileError) throw profileError;

  const access = memberships.map((membership) => {
    const workspace = workspaces?.find((item) => item.id === membership.workspace_id);
    return {
      workspaceId: membership.workspace_id,
      workspaceName: workspace?.name ?? 'Kudos workspace',
      workspaceType: (workspace?.type ?? 'family') as WorkspaceAccess['workspaceType'],
      role: membership.role as WorkspaceAccess['role'],
      linkedProfileId: linkedProfiles?.find((profile) => profile.workspace_id === membership.workspace_id)?.id ?? null,
    };
  });
  const allowedAccess = childOnly ? childOnlyAccess(access) : access;
  await saveCachedWorkspaceAccess(userId, allowedAccess);
  return allowedAccess;
}

export async function createWorkspace(name: string, type: WorkspaceType) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('create_workspace', { p_name: name.trim(), p_type: type });
  if (error) throw error;
  await AsyncStorage.setItem(SELECTED_WORKSPACE_KEY, String(data));
  return String(data);
}

export async function renameWorkspace(workspaceId: string, name: string) {
  const normalizedName = name.trim();
  if (normalizedName.length < 2 || normalizedName.length > 80) {
    throw new Error('Enter a name between 2 and 80 characters.');
  }
  const client = requireSupabase();
  const { error } = await client
    .from('workspaces')
    .update({ name: normalizedName })
    .eq('id', workspaceId);
  if (error) throw error;
  return normalizedName;
}

export async function acceptProfileInvite(code: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('profile-invite', { body: { action: 'accept', code: code.trim() } });
  if (error) await throwFunctionError(error, 'profile-invite');
  if (data?.error) throw new Error(data.error);
  const workspaceId = String(data.data.workspace_id);
  await AsyncStorage.setItem(SELECTED_WORKSPACE_KEY, workspaceId);
  await AsyncStorage.removeItem(PENDING_ADULT_INVITE_KEY);
  return workspaceId;
}

export async function savePendingAdultInvite(code: string) {
  await AsyncStorage.setItem(PENDING_ADULT_INVITE_KEY, code.trim());
}

export async function clearPendingAdultInvite() {
  await AsyncStorage.removeItem(PENDING_ADULT_INVITE_KEY);
}

export async function getPendingAdultInviteCode() {
  const storedCode = await AsyncStorage.getItem(PENDING_ADULT_INVITE_KEY);
  if (storedCode?.trim()) return storedCode.trim();
  const { data } = await requireSupabase().auth.getUser();
  const metadataCode = data.user?.user_metadata?.adult_invite_code;
  return typeof metadataCode === 'string' && metadataCode.trim() ? metadataCode.trim() : null;
}

export async function acceptPendingAdultInvite() {
  const code = await getPendingAdultInviteCode();
  if (!code) return null;
  const workspaceId = await acceptAdultInvite(code);
  await AsyncStorage.removeItem(PENDING_ADULT_INVITE_KEY);
  // The metadata copy lets confirmation and first sign-in finish on another
  // device. Clear it only after the server confirms membership.
  await requireSupabase().auth.updateUser({ data: { adult_invite_code: null } }).catch(() => undefined);
  return workspaceId;
}

export async function createProfileInvite(profileId: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('profile-invite', { body: { action: 'create', profileId, hours: 168 } });
  if (error) await throwFunctionError(error, 'profile-invite');
  if (data?.error) throw new Error(data.error);
  return data.data as { code: string; expires_at: string; profile_id: string };
}

export async function replaceProfileInvite(profileId: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('profile-invite', { body: { action: 'replace', profileId } });
  if (error) await throwFunctionError(error, 'profile-invite');
  if (data?.error) throw new Error(data.error);
  return data.data as { code: string; expires_at: string; profile_id: string; replaced: boolean };
}

export type AdultAccessList = {
  adults: { userId: string; email: string; role: 'parent' | 'teacher'; isCurrentUser: boolean }[];
  invitations: { id: string; invited_email: string; expires_at: string; created_at: string }[];
};

export async function createAdultInvite(workspaceId: string, email: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('adult-invite', { body: { action: 'create', workspaceId, email: email.trim() } });
  if (error) await throwFunctionError(error, 'adult-invite');
  if (data?.error) throw new Error(data.error);
  return data.data as { sent: true; invitation: { id: string; invited_email: string; expires_at: string; created_at: string } };
}

export async function acceptAdultInvite(code: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('adult-invite', { body: { action: 'accept', code: code.trim() } });
  if (error) await throwFunctionError(error, 'adult-invite');
  if (data?.error) throw new Error(data.error);
  const workspaceId = String(data.data.workspace_id);
  await AsyncStorage.setItem(SELECTED_WORKSPACE_KEY, workspaceId);
  return workspaceId;
}

export async function listAdultAccess(workspaceId: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('list_adult_access', { p_workspace_id: workspaceId });
  if (error) throw new Error(error.message || 'Adult access could not be loaded. Make sure the latest database migrations are deployed.');
  return data as AdultAccessList;
}

export async function cancelAdultInvite(invitationId: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('adult-invite', { body: { action: 'cancel', invitationId } });
  if (error) await throwFunctionError(error, 'adult-invite');
  if (data?.error) throw new Error(data.error);
}

export async function removeAdultAccess(workspaceId: string, userId: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('adult-invite', { body: { action: 'remove', workspaceId, userId } });
  if (error) await throwFunctionError(error, 'adult-invite');
  if (data?.error) throw new Error(data.error);
}

export async function getSelectedWorkspaceId() {
  return AsyncStorage.getItem(SELECTED_WORKSPACE_KEY);
}

export async function setSelectedWorkspaceId(workspaceId: string) {
  await AsyncStorage.setItem(SELECTED_WORKSPACE_KEY, workspaceId);
}
