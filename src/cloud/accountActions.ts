import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireSupabase } from './supabase';
import type { WorkspaceAccess } from './types';

const SELECTED_WORKSPACE_KEY = '@brightsteps/cloud-selected-workspace-v1';

function errorText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value instanceof Error && value.message && value.message !== '[object Object]') return value.message;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'details', 'hint', 'code']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (candidate && typeof candidate === 'object') {
        const nested = errorText(candidate, '');
        if (nested) return nested;
      }
    }
  }
  return fallback;
}

async function throwDeleteFunctionError(error: unknown): Promise<never> {
  const candidate = error as { context?: Response };
  let detail = errorText(error, 'The account deletion service could not be reached.');
  const response = candidate?.context;
  if (response && typeof response.clone === 'function') {
    try {
      detail = errorText(await response.clone().json(), detail);
    } catch {
      try {
        const text = await response.clone().text();
        if (text.trim()) detail = text.trim();
      } catch { /* keep the best message already found */ }
    }
  }
  if (/requested function was not found|function.*not found/i.test(detail)) {
    throw new Error('Kudos Cloud is missing the delete-account Edge Function in this environment. Deploy the latest production function and try again.');
  }
  throw new Error(detail);
}

export async function deleteKudosAccount(access: WorkspaceAccess) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('delete-account', {
    body: { workspaceId: access.workspaceId },
  });
  if (error) await throwDeleteFunctionError(error);
  if (data?.error) throw new Error(data.error);
  await AsyncStorage.removeItem(SELECTED_WORKSPACE_KEY).catch(() => undefined);
  return data?.data as { deleted: boolean; scope: 'family' | 'child'; accountRetained?: boolean; deletedAuthUsers?: number; retainedAuthUsers?: number } | undefined;
}

export type EntireAccountPreview = {
  scope: 'account-preview';
  userId: string;
  ownedWorkspaces: { id: string; name: string; type: string }[];
  joinedWorkspaceIds: string[];
};

export async function previewEntireAccountDeletion(): Promise<EntireAccountPreview> {
  // Intentionally omit workspaceId: an older deployed function then rejects
  // this request instead of mistaking a read-only preview for workspace deletion.
  const { data, error } = await requireSupabase().functions.invoke('delete-account', { body: { action: 'preview_entire_account' } });
  if (error) await throwDeleteFunctionError(error);
  if (data?.error) throw new Error(data.error);
  if (data?.data?.scope !== 'account-preview') throw new Error('Update the account deletion service before trying again.');
  return data.data;
}

export async function deleteEntireKudosAccount(preview: EntireAccountPreview) {
  const { data, error } = await requireSupabase().functions.invoke('delete-account', { body: {
    action: 'delete_entire_account', confirm: true, expectedUserId: preview.userId,
    expectedWorkspaceIds: preview.ownedWorkspaces.map((item) => item.id),
    expectedJoinedWorkspaceIds: preview.joinedWorkspaceIds,
  } });
  if (error) await throwDeleteFunctionError(error);
  if (data?.error) throw new Error(data.error);
  if (data?.data?.scope !== 'account' || data.data.deleted !== true) throw new Error('Account deletion was not confirmed by Kudos Cloud.');
  // Remove this user's membership/entitlement caches only; do not wipe another
  // user's cached account on a shared device.
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const workspaceIds = [...preview.ownedWorkspaces.map((item) => item.id), ...preview.joinedWorkspaceIds];
  await AsyncStorage.multiRemove(keys.filter((key) => key === SELECTED_WORKSPACE_KEY
    || key === `@kudos/workspace-access-v1/${preview.userId}`
    || workspaceIds.some((id) => ['@brightsteps/cloud-cache-v1', '@brightsteps/cloud-queue-v1', '@brightsteps/cloud-failed-v1'].some((prefix) => key === `${prefix}/${id}`))
    || key.startsWith(`@kudos/workspace-entitlement-v1/${preview.userId}/`))).catch(() => undefined);
}
