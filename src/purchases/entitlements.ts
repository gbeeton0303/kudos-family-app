import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Purchase } from 'expo-iap';
import { requireSupabase } from '../cloud/supabase';
import { evaluateEntitlement, type EvaluatedEntitlement, type WorkspaceEntitlement } from './entitlementPolicy';

const ENTITLEMENT_CACHE_PREFIX = '@kudos/workspace-entitlement-v1';

function cacheKey(userId: string, workspaceId: string) {
  return `${ENTITLEMENT_CACHE_PREFIX}/${userId}/${workspaceId}`;
}

function errorText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value instanceof Error && value.message && value.message !== '[object Object]') return value.message;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'details', 'hint']) {
      const nested = errorText(record[key], '');
      if (nested) return nested;
    }
  }
  return fallback;
}

async function throwFunctionError(error: unknown): Promise<never> {
  const candidate = error as { context?: Response };
  let detail = errorText(error, 'Kudos could not check the family purchase right now.');
  if (candidate?.context && typeof candidate.context.clone === 'function') {
    try {
      detail = errorText(await candidate.context.clone().json(), detail);
    } catch {
      try {
        const text = await candidate.context.clone().text();
        if (text.trim()) detail = text.trim();
      } catch { /* retain the best available detail */ }
    }
  }
  if (/requested function was not found|function.*not found/i.test(detail)) {
    throw new Error('Kudos Cloud is missing the entitlement-action Edge Function. Deploy the latest production function and try again.');
  }
  throw new Error(detail);
}

function isWorkspaceEntitlement(value: unknown): value is WorkspaceEntitlement {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceEntitlement>;
  return typeof candidate.workspaceId === 'string'
    && typeof candidate.status === 'string'
    && typeof candidate.canAccess === 'boolean'
    && typeof candidate.canPurchase === 'boolean'
    && typeof candidate.checkedAt === 'string';
}

export async function readCachedEntitlement(userId: string, workspaceId: string): Promise<EvaluatedEntitlement | null> {
  const stored = await AsyncStorage.getItem(cacheKey(userId, workspaceId));
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return isWorkspaceEntitlement(parsed) ? evaluateEntitlement(parsed, Date.now(), 'offline') : null;
  } catch {
    return null;
  }
}

export async function cacheEntitlement(userId: string, entitlement: WorkspaceEntitlement) {
  await AsyncStorage.setItem(cacheKey(userId, entitlement.workspaceId), JSON.stringify(entitlement));
}

export async function fetchWorkspaceEntitlement(userId: string, workspaceId: string): Promise<EvaluatedEntitlement> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('entitlement-action', {
    body: { action: 'status', workspaceId },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(errorText(data.error, 'The workspace purchase could not be checked.'));
  if (!isWorkspaceEntitlement(data?.data)) throw new Error('Kudos Cloud returned an invalid purchase status.');
  await cacheEntitlement(userId, data.data);
  return evaluateEntitlement(data.data, Date.now(), 'online');
}

export async function startWorkspaceTrial(userId: string, workspaceId: string): Promise<EvaluatedEntitlement> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('entitlement-action', {
    body: { action: 'start_trial', workspaceId },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(errorText(data.error, 'The free trial could not be started.'));
  if (!isWorkspaceEntitlement(data?.data)) throw new Error('Kudos Cloud returned an invalid trial status.');
  await cacheEntitlement(userId, data.data);
  return evaluateEntitlement(data.data, Date.now(), 'online');
}

export async function verifyWorkspacePurchase(
  userId: string,
  workspaceId: string,
  purchase: Purchase,
): Promise<EvaluatedEntitlement> {
  const transactionId = purchase.transactionId || purchase.id;
  if (!transactionId) throw new Error('Apple did not provide a transaction identifier for this purchase.');

  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('entitlement-action', {
    body: {
      action: 'verify',
      workspaceId,
      productId: purchase.productId,
      transactionId,
      purchaseToken: purchase.purchaseToken ?? '',
    },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(errorText(data.error, 'Apple could not verify this purchase.'));
  if (!isWorkspaceEntitlement(data?.data)) throw new Error('Kudos Cloud returned an invalid verified purchase.');
  await cacheEntitlement(userId, data.data);
  return evaluateEntitlement(data.data, Date.now(), 'online');
}

export async function reconcileMissingApplePurchase(
  userId: string,
  workspaceId: string,
): Promise<EvaluatedEntitlement> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('entitlement-action', {
    body: { action: 'reconcile_apple_entitlement', workspaceId },
  });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(errorText(data.error, 'Apple purchase access could not be reconciled.'));
  if (!isWorkspaceEntitlement(data?.data)) throw new Error('Kudos Cloud returned an invalid Apple purchase status.');
  await cacheEntitlement(userId, data.data);
  return evaluateEntitlement(data.data, Date.now(), 'online');
}
