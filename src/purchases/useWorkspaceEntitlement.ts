import { useCallback, useEffect, useState } from 'react';
import { fetchWorkspaceEntitlement, readCachedEntitlement } from './entitlements';
import { OFFLINE_TRIAL_GRACE_MS, type EvaluatedEntitlement } from './entitlementPolicy';

export function useWorkspaceEntitlement(userId: string, workspaceId: string) {
  const [entitlement, setEntitlement] = useState<EvaluatedEntitlement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const remote = await fetchWorkspaceEntitlement(userId, workspaceId);
      setEntitlement(remote);
      setError(null);
      return remote;
    } catch (value) {
      const cached = await readCachedEntitlement(userId, workspaceId);
      if (cached) setEntitlement(cached);
      setError(value instanceof Error ? value.message : 'Kudos could not check this family purchase.');
      return cached;
    } finally {
      setIsLoading(false);
    }
  }, [userId, workspaceId]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setEntitlement(null);
    setError(null);
    readCachedEntitlement(userId, workspaceId)
      .then((cached) => { if (mounted && cached) setEntitlement(cached); })
      .finally(() => {
        if (!mounted) return;
        void refresh();
      });
    return () => { mounted = false; };
  }, [refresh, userId, workspaceId]);

  useEffect(() => {
    if (entitlement?.status !== 'trial' || !entitlement.trialExpiresAt) return;
    const expiration = new Date(entitlement.trialExpiresAt).getTime();
    if (!Number.isFinite(expiration)) return;
    const nextCheckAt = entitlement.isOfflineGrace ? expiration + OFFLINE_TRIAL_GRACE_MS : expiration;
    const delay = Math.max(250, nextCheckAt - Date.now() + 250);
    const timer = setTimeout(() => { void refresh(); }, Math.min(delay, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [entitlement?.isOfflineGrace, entitlement?.status, entitlement?.trialExpiresAt, refresh]);

  return { entitlement, error, isLoading, refresh, setEntitlement };
}
