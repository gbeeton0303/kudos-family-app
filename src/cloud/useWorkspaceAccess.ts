import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { acceptPendingAdultInvite, getPendingAdultInviteCode, getSelectedWorkspaceId, loadCachedWorkspaceAccess, loadWorkspaceAccess, setSelectedWorkspaceId } from './workspaces';
import type { WorkspaceAccess } from './types';

export function useWorkspaceAccess(user: User | null) {
  const [accessList, setAccessList] = useState<WorkspaceAccess[]>([]);
  const [selected, setSelected] = useState<WorkspaceAccess | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);
  const [hasPendingAdultInvite, setHasPendingAdultInvite] = useState(false);

  const refresh = useCallback(async (background = false) => {
    if (!user) {
      setAccessList([]);
      setSelected(null);
      setIsLoading(false);
      setHasPendingAdultInvite(false);
      return;
    }
    const childOnly = user.is_anonymous === true || user.user_metadata?.account_type === 'child';
    if (!background) setIsLoading(true);
    try {
      const pendingCode = childOnly ? null : await getPendingAdultInviteCode();
      setHasPendingAdultInvite(Boolean(pendingCode));
      let invitationError: string | null = null;
      if (pendingCode) {
        try {
          await acceptPendingAdultInvite();
          setHasPendingAdultInvite(false);
        } catch (cause) {
          invitationError = cause instanceof Error ? cause.message : String(cause);
        }
      }
      const list = await loadWorkspaceAccess(user.id, childOnly);
      const savedId = await getSelectedWorkspaceId();
      const next = list.find((item) => item.workspaceId === savedId) ?? list[0] ?? null;
      setAccessList(list);
      setSelected(next);
      if (next) await setSelectedWorkspaceId(next.workspaceId);
      setError(invitationError);
    } catch (cause) {
      const cached = await loadCachedWorkspaceAccess(user.id, childOnly);
      if (cached.length) {
        const savedId = await getSelectedWorkspaceId();
        setAccessList(cached);
        setSelected(cached.find((item) => item.workspaceId === savedId) ?? cached[0]);
      }
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!user) {
        await refresh();
        return;
      }
      const childOnly = user.is_anonymous === true || user.user_metadata?.account_type === 'child';
      const cached = await loadCachedWorkspaceAccess(user.id, childOnly);
      if (!mounted) return;
      if (cached.length) {
        const savedId = await getSelectedWorkspaceId();
        if (!mounted) return;
        setAccessList(cached);
        setSelected(cached.find((item) => item.workspaceId === savedId) ?? cached[0]);
        setIsLoading(false);
      }
      await refresh(cached.length > 0);
    })();
    return () => { mounted = false; };
  }, [refresh, user]);

  const selectWorkspace = useCallback(async (workspaceId: string) => {
    const next = accessList.find((item) => item.workspaceId === workspaceId) ?? null;
    setSelected(next);
    if (next) await setSelectedWorkspaceId(next.workspaceId);
  }, [accessList]);

  return { accessList, selected, isLoading, error, hasPendingAdultInvite, refresh, selectWorkspace };
}
