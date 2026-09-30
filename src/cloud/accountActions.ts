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
