export function cloudStorageKeys(userId: string, workspaceId: string) {
  if (!userId || !workspaceId) throw new Error('An authenticated account and workspace are required.');
  const suffix = `${encodeURIComponent(userId)}/${encodeURIComponent(workspaceId)}`;
  // Legacy v1 records have no account attribution. Preserve them on disk, but
  // never load or replay them under an identity we cannot prove owns them.
  return {
    cache: `@brightsteps/cloud-cache-v2/${suffix}`,
    queue: `@brightsteps/cloud-queue-v2/${suffix}`,
    failed: `@brightsteps/cloud-failed-v2/${suffix}`,
  };
}

export class CloudSessionChangedError extends Error {
  constructor() { super('The signed-in account changed. Sync paused for the previous account.'); }
}

export function createCloudSessionScope(userId: string) {
  let active = true;
  const controller = new AbortController();
  return {
    signal: controller.signal,
    isActive: () => active,
    assertActive() { if (!active) throw new CloudSessionChangedError(); },
    observeUser(nextUserId: string | undefined) {
      if (nextUserId !== userId) { active = false; controller.abort(); }
    },
    stop() { active = false; controller.abort(); },
  };
}
