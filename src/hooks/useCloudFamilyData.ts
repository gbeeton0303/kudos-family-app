import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  archiveTask,
  canCompleteTask,
  createInitialFamilyState,
  getTaskPeriodKey,
  hasTaskCompletionForPeriod,
  toDateKey,
  getProfileBalance,
  makeId,
  normalizeFamilyState,
  recordTaskCompletion,
  removeTaskCompletion,
} from '../data/familyData';
import type {
  ChildProfile,
  ChildReward,
  ChildTask,
  CurrencyType,
  FamilyState,
  NewRewardInput,
  NewTaskInput,
  ProfileAvatar,
  ProfileColorKey,
  ProfilePattern,
  StorageType,
  TaskCompletionRequestStatus,
} from '../types';
import {
  executeCloudMutation,
  fetchCloudFamilyState,
  type CloudMutation,
} from '../cloud/repository';
import { createScopedCloudClient, requireSupabase } from '../cloud/supabase';
import { useAuth } from '../cloud/AuthContext';
import { cloudStorageKeys, createCloudSessionScope } from '../cloud/cloudStorageScope';
import { retryCloudRead } from '../cloud/retryCloudRead';
import type { CloudSyncStatus, FailedSyncChange } from '../cloud/types';
import type { FamilyDataController, NewProfileInput } from './familyController';

function cacheKey(workspaceId: string, userId: string) {
  return cloudStorageKeys(userId, workspaceId).cache;
}
function queueKey(workspaceId: string, userId: string) {
  return cloudStorageKeys(userId, workspaceId).queue;
}
function failedKey(workspaceId: string, userId: string) {
  return cloudStorageKeys(userId, workspaceId).failed;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message && error.message !== '[object Object]') return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    for (const key of ['message', 'error', 'details', 'hint', 'code']) {
      const candidate = value[key];
      if (typeof candidate === 'string' && candidate.trim() && candidate !== '[object Object]') return candidate.trim();
      if (candidate && typeof candidate === 'object') {
        const nested = errorMessage(candidate);
        if (nested && nested !== 'Cloud request failed.') return nested;
      }
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch { /* fall through */ }
  }
  return 'Cloud request failed.';
}

function isNetworkMutationError(message: string) {
  return /network request failed|failed to fetch|network error|timeout|timed out|connection|offline|internet|dns|socket/i.test(message);
}

function isPermanentMutationError(message: string) {
  if (isNetworkMutationError(message)) return false;
  return /insufficient balance|already completed|already redeemed|not assigned|not authorized|not scheduled|not found|invalid|duplicate|violates.*constraint|permission denied|non-2xx|edge function|rpc|schema cache|function .* does not exist|column .* does not exist/i.test(message)
    || message === 'Cloud request failed.';
}

export function useCloudFamilyData(workspaceId: string): FamilyDataController {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const scope = useMemo(() => createCloudSessionScope(userId), [userId, workspaceId]);
  const [family, setFamily] = useState<FamilyState>(() => createInitialFamilyState());
  const familyRef = useRef(family);
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [failedSyncChanges, setFailedSyncChanges] = useState<FailedSyncChange[]>([]);
  const [pendingMutationCount, setPendingMutationCount] = useState(0);
  const failedRef = useRef<FailedSyncChange[]>([]);
  const queueRef = useRef<CloudMutation[]>([]);
  const flushingRef = useRef(false);
  const refreshInFlight = useRef<Promise<FamilyState | null> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageWritesRef = useRef<Promise<void>>(Promise.resolve());
  const taskTapGuardRef = useRef(new Set<string>());

  useEffect(() => {
    const { data } = requireSupabase().auth.onAuthStateChange((_event, session) => {
      // Synchronous invalidation occurs before React renders the new account.
      scope.observeUser(session?.user.id);
    });
    return () => { scope.stop(); data.subscription.unsubscribe(); };
  }, [scope]);

  const sessionClient = useCallback(async () => {
    scope.assertActive();
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw error;
    scope.observeUser(data.session?.user.id);
    scope.assertActive();
    if (!data.session) throw new Error('Sign in before syncing.');
    return createScopedCloudClient(data.session, scope);
  }, [scope]);

  const writeStorage = useCallback((key: string, value: string) => {
    // Serialize snapshots captured at enqueue time so late writes cannot replace
    // a newer queue or cache with an older one.
    const write = storageWritesRef.current.catch(() => undefined).then(() => AsyncStorage.setItem(key, value));
    storageWritesRef.current = write;
    return write;
  }, []);

  const persistCache = useCallback((next: FamilyState) => {
    void writeStorage(cacheKey(workspaceId, userId), JSON.stringify(next)).catch(() => undefined);
  }, [userId, workspaceId, writeStorage]);

  const applySnapshot = useCallback((next: FamilyState) => {
    if (!scope.isActive()) return;
    familyRef.current = next;
    setFamily(next);
    persistCache(next);
  }, [persistCache, scope]);

  const updateFamily = useCallback((updater: (current: FamilyState) => FamilyState) => {
    if (!scope.isActive()) return;
    // Apply outside React's deferred state updater. Sequential actions always
    // read the latest optimistic snapshot, even before React renders it.
    applySnapshot(updater(familyRef.current));
  }, [applySnapshot, scope]);

  const refresh = useCallback(async () => {
    if (!scope.isActive()) return null;
    if (refreshInFlight.current) return refreshInFlight.current;
    setSyncStatus((current) => current === 'loading' ? 'loading' : 'syncing');
    const request = (async () => {
    try {
      const next = await retryCloudRead(async () => fetchCloudFamilyState(workspaceId, await sessionClient()));
      if (!scope.isActive() || queueRef.current.length) return null;
      applySnapshot(next);
      setSyncError(null);
      setSyncStatus('synced');
      return next;
    } catch (error) {
      if (!scope.isActive()) return null;
      setSyncError(errorMessage(error));
      setSyncStatus('offline');
      return null;
    }
    })();
    refreshInFlight.current = request;
    try { return await request; }
    finally { if (refreshInFlight.current === request) refreshInFlight.current = null; }
  }, [applySnapshot, scope, sessionClient, workspaceId]);

  const persistQueue = useCallback(async () => {
    await writeStorage(queueKey(workspaceId, userId), JSON.stringify(queueRef.current));
  }, [userId, workspaceId, writeStorage]);

  const persistFailed = useCallback(async () => {
    await writeStorage(failedKey(workspaceId, userId), JSON.stringify(failedRef.current));
    if (!scope.isActive()) return;
    setFailedSyncChanges([...failedRef.current]);
  }, [scope, userId, workspaceId, writeStorage]);

  const flushQueue = useCallback(async () => {
    if (!scope.isActive() || flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    setSyncStatus('syncing');
    let permanentFailureCount = 0;
    try {
      while (scope.isActive() && queueRef.current.length) {
        const mutation = queueRef.current[0];
        try {
          await executeCloudMutation(workspaceId, mutation, await sessionClient());
          if (!scope.isActive()) return;
          queueRef.current = queueRef.current.slice(1);
          setPendingMutationCount(queueRef.current.length);
          await persistQueue();
        } catch (error) {
          if (!scope.isActive()) return;
          const message = errorMessage(error);
          // Real connectivity failures pause the queue for retry. Application,
          // RPC, constraint and Edge Function failures are isolated so one
          // broken operation cannot block every later profile/task/reward write.
          if (!isPermanentMutationError(message)) throw error;
          const prior = failedRef.current.find((item) => item.id === mutation.id);
          failedRef.current = [
            ...failedRef.current.filter((item) => item.id !== mutation.id),
            { id: mutation.id, mutation, error: message, failedAt: new Date().toISOString(), attempts: (prior?.attempts ?? 0) + 1 },
          ];
          queueRef.current = queueRef.current.slice(1);
          setPendingMutationCount(queueRef.current.length);
          permanentFailureCount += 1;
          await Promise.all([persistQueue(), persistFailed()]);
        }
      }
      const snapshot = await refresh();
      // A failed snapshot must not be overwritten with a false synced state.
      if (snapshot) {
        setSyncError(permanentFailureCount ? `${permanentFailureCount} change${permanentFailureCount === 1 ? '' : 's'} need review.` : null);
        setSyncStatus('synced');
      }
    } catch (error) {
      if (!scope.isActive()) return;
      setSyncError(errorMessage(error));
      setSyncStatus('offline');
    } finally {
      flushingRef.current = false;
    }
  }, [persistFailed, persistQueue, refresh, scope, sessionClient, workspaceId]);

  const enqueue = useCallback((mutation: CloudMutation) => {
    if (!scope.isActive()) return;
    queueRef.current = [...queueRef.current, mutation];
    setPendingMutationCount(queueRef.current.length);
    setSyncStatus('syncing');
    void persistQueue().then(() => flushQueue()).catch((error) => {
      if (scope.isActive()) { setSyncError(errorMessage(error)); setSyncStatus('offline'); }
    });
  }, [flushQueue, persistQueue, scope]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [cached, queued, failed] = await Promise.all([
        AsyncStorage.getItem(cacheKey(workspaceId, userId)),
        AsyncStorage.getItem(queueKey(workspaceId, userId)),
        AsyncStorage.getItem(failedKey(workspaceId, userId)),
      ]);
      if (!mounted || !scope.isActive()) return;
      if (cached) {
        try { applySnapshot(normalizeFamilyState(JSON.parse(cached))); } catch { /* ignore invalid cache */ }
      }
      if (queued) {
        try { queueRef.current = JSON.parse(queued) as CloudMutation[]; } catch { queueRef.current = []; }
      }
      if (failed) {
        try {
          const parsed = JSON.parse(failed) as FailedSyncChange[];
          // Older versions could permanently strand a task after creating its
          // template but failing to create the profile assignment. v3.9.50's
          // task writes are idempotent, so automatically replay only these
          // assignment-bearing mutations once on startup to repair that state.
          const repairableTypes = new Set<CloudMutation['type']>(['add_task', 'update_task', 'set_task_assignment']);
          const repairable = parsed.filter((item) => repairableTypes.has(item.mutation.type));
          const retained = parsed.filter((item) => !repairableTypes.has(item.mutation.type));
          const queuedIds = new Set(queueRef.current.map((mutation) => mutation.id));
          queueRef.current = [...queueRef.current, ...repairable.map((item) => item.mutation).filter((mutation) => !queuedIds.has(mutation.id))];
          failedRef.current = retained.map((item) => ({ ...item, error: item.error === '[object Object]' ? 'Cloud request failed. Retry this change to retrieve the current server message.' : item.error }));
          await Promise.all([
            writeStorage(queueKey(workspaceId, userId), JSON.stringify(queueRef.current)),
            writeStorage(failedKey(workspaceId, userId), JSON.stringify(failedRef.current)),
          ]);
          if (!mounted || !scope.isActive()) return;
          setFailedSyncChanges([...failedRef.current]);
        } catch { failedRef.current = []; }
      }
      if (!mounted || !scope.isActive()) return;
      setPendingMutationCount(queueRef.current.length);
      setIsHydrated(true);
      // Preserve the optimistic cached state until queued offline changes have
      // reached the server. Refreshing first would briefly roll them back.
      if (queueRef.current.length) await flushQueue();
      else await refresh();
    }
    void load().catch((error) => {
      if (mounted && scope.isActive()) { setSyncError(errorMessage(error)); setSyncStatus('offline'); setIsHydrated(true); }
    });
    return () => { mounted = false; };
  }, [applySnapshot, flushQueue, refresh, scope, userId, workspaceId, writeStorage]);

  useEffect(() => {
    if (!isHydrated) return;
    const retryWhenAvailable = () => {
      if (queueRef.current.length) void flushQueue();
      else if (syncStatus === 'offline') void refresh();
    };
    const timer = setInterval(retryWhenAvailable, 12_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryWhenAvailable();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [flushQueue, isHydrated, refresh, syncStatus]);

  useEffect(() => {
    const client = requireSupabase();
    const tables = [
      'child_profiles',
      'task_templates',
      'task_assignments',
      'task_completions',
      'task_completion_requests',
      'reward_templates',
      'reward_assignments',
      'reward_redemptions',
      'reward_deliveries',
      'currency_ledger',
    ];
    let channel = client.channel(`brightsteps-workspace-${workspaceId}`);
    for (const table of tables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => { if (queueRef.current.length) void flushQueue(); else void refresh(); }, 250);
      });
    }
    channel.subscribe();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void client.removeChannel(channel);
    };
  }, [flushQueue, refresh, workspaceId]);

  const addProfile = useCallback((input: NewProfileInput) => {
    const profile: ChildProfile = {
      id: makeId('profile'),
      name: input.name.trim(),
      avatar: input.avatar,
      colorKey: input.colorKey,
      pattern: input.pattern,
      currencyType: input.currencyType,
      storageType: input.storageType,
      startingBalance: 0,
      createdAt: new Date().toISOString(),
    };
    updateFamily((current) => ({ ...current, profiles: [...current.profiles, profile] }));
    enqueue({ id: makeId('mutation'), type: 'add_profile', payload: { profile } });
    return profile.id;
  }, [enqueue, updateFamily]);


  const updateProfile = useCallback((profileId: string, input: NewProfileInput) => {
    const profile = familyRef.current.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const updated = { ...profile, name: input.name.trim(), avatar: input.avatar, colorKey: input.colorKey, pattern: input.pattern, currencyType: input.currencyType, storageType: input.storageType };
    updateFamily((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === profileId ? updated : item) }));
    enqueue({ id: makeId('mutation'), type: 'update_profile', payload: { profile: updated } });
  }, [enqueue, updateFamily]);

  const updateOwnProfilePreferences = useCallback((profileId: string, input: NewProfileInput) => {
    const profile = familyRef.current.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const updated = { ...profile, colorKey: input.colorKey, pattern: input.pattern, currencyType: input.currencyType, storageType: input.storageType };
    updateFamily((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === profileId ? updated : item) }));
    enqueue({ id: makeId('mutation'), type: 'update_child_preferences', payload: { profile: updated } });
  }, [enqueue, updateFamily]);

  const deleteProfile = useCallback((profileId: string) => {
    updateFamily((current) => ({
      profiles: current.profiles.filter((profile) => profile.id !== profileId),
      tasks: current.tasks.map((task) => {
        const { [profileId]: _removed, ...remainingEvents } = task.completionEvents;
        const { [profileId]: _removedPeriods, ...remainingPeriods } = task.completionPeriods ?? {};
        return { ...task, assignedProfileIds: task.assignedProfileIds.filter((id) => id !== profileId), completionEvents: remainingEvents, completionPeriods: remainingPeriods };
      }),
      rewards: current.rewards.map((reward) => {
        const { [profileId]: _removed, ...remainingEvents } = reward.redemptionEvents;
        return { ...reward, assignedProfileIds: reward.assignedProfileIds.filter((id) => id !== profileId), redemptionEvents: remainingEvents };
      }),
      completionRequests: current.completionRequests.filter((request) => request.profileId !== profileId),
      rewardDeliveries: current.rewardDeliveries.filter((delivery) => delivery.profileId !== profileId),
    }));
    enqueue({ id: makeId('mutation'), type: 'delete_profile', payload: { profileId } });
  }, [enqueue, updateFamily]);

  const addTask = useCallback((input: NewTaskInput) => {
    const task: ChildTask = {
      id: makeId('task'),
      title: input.title.trim(),
      amount: Math.max(1, input.amount),
      frequency: input.frequency,
      description: input.description?.trim() || undefined,
      icon: input.icon,
      assignedProfileIds: Array.from(new Set(input.profileIds ?? [])),
      completionEvents: {},
      createdAt: new Date().toISOString(),
      scheduleDays: input.frequency === 'weekly'
        ? Array.from(new Set(input.scheduleDays?.length ? input.scheduleDays : [new Date().getDay()])).sort()
        : undefined,
      scheduleDates: input.frequency === 'custom' ? Array.from(new Set(input.scheduleDates ?? [])).sort() : undefined,
    };
    updateFamily((current) => ({ ...current, tasks: [...current.tasks, task] }));
    enqueue({ id: makeId('mutation'), type: 'add_task', payload: { task } });
    return task.id;
  }, [enqueue, updateFamily]);

  const deleteTask = useCallback((taskId: string) => {
    updateFamily((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId ? archiveTask(task) : task),
      completionRequests: current.completionRequests.filter((request) => request.taskId !== taskId),
    }));
    enqueue({ id: makeId('mutation'), type: 'delete_task', payload: { taskId } });
  }, [enqueue, updateFamily]);

  const updateTask = useCallback((taskId: string, input: NewTaskInput) => {
    const task = familyRef.current.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const updated = {
        ...task,
        title: input.title.trim(), amount: Math.max(1, input.amount), frequency: input.frequency,
        description: input.description?.trim() || undefined, icon: input.icon,
        assignedProfileIds: Array.from(new Set(input.profileIds ?? task.assignedProfileIds)),
        scheduleDays: input.frequency === 'weekly' ? Array.from(new Set(input.scheduleDays?.length ? input.scheduleDays : [new Date().getDay()])).sort() : undefined,
        scheduleDates: input.frequency === 'custom' ? Array.from(new Set(input.scheduleDates ?? [])).sort() : undefined,
      };
    updateFamily((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === taskId ? updated : item) }));
    enqueue({ id: makeId('mutation'), type: 'update_task', payload: { task: updated } });
  }, [enqueue, updateFamily]);

  const setTaskAssigned = useCallback((taskId: string, profileId: string, assigned: boolean) => {
    updateFamily((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const nextAssigned = assigned
          ? Array.from(new Set([...task.assignedProfileIds, profileId]))
          : task.assignedProfileIds.filter((id) => id !== profileId);
        if (assigned) return { ...task, assignedProfileIds: nextAssigned };
        return { ...task, assignedProfileIds: nextAssigned };
      }),
      completionRequests: assigned
        ? current.completionRequests
        : current.completionRequests.filter((request) => !(request.taskId === taskId && request.profileId === profileId)),
    }));
    enqueue({ id: makeId('mutation'), type: 'set_task_assignment', payload: { taskId, profileId, assigned } });
  }, [enqueue, updateFamily]);

  const completeTask = useCallback(async (taskId: string, profileId: string, occurredAt = new Date().toISOString(), allowRepeatDaily = false) => {
    const completionDate = new Date(occurredAt);
    const target = family.tasks.find((task) => task.id === taskId);
    const canRepeat = Boolean(allowRepeatDaily && target?.frequency === 'daily' && target.assignedProfileIds.includes(profileId) && hasTaskCompletionForPeriod(target, profileId, completionDate));
    if (!target || (!canCompleteTask(target, profileId, completionDate) && !canRepeat)) return false;

    const eventId = makeId('completion');
    const periodKey = getTaskPeriodKey(target.frequency, completionDate);
    const localDate = toDateKey(completionDate);
    const tapKey = `complete:${taskId}:${profileId}`;
    if (taskTapGuardRef.current.has(tapKey)) return false;
    taskTapGuardRef.current.add(tapKey);
    setTimeout(() => taskTapGuardRef.current.delete(tapKey), 750);

    // Apply locally first so task completion is immediate and works offline.
    // The idempotent server RPC will reconcile this exact event after the
    // device reconnects, and a failed server validation remains reviewable in
    // the Failed Sync Changes screen.
    updateFamily((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id !== taskId ? task : recordTaskCompletion(task, profileId, occurredAt, true, canRepeat)),
      completionRequests: current.completionRequests.map((request) =>
        request.taskId === taskId && request.profileId === profileId && request.status === 'pending' && request.periodKey === periodKey
          ? { ...request, status: 'approved', reviewedAt: occurredAt }
          : request,
      ),
    }));
    enqueue({
      id: makeId('mutation'),
      type: 'complete_task',
      payload: { eventId, taskId, profileId, occurredAt, periodKey, localDate, allowRepeatDaily: canRepeat },
    });
    return true;
  }, [enqueue, family.tasks, updateFamily]);


  const undoTaskCompletion = useCallback((taskId: string, profileId: string) => {
    const task = family.tasks.find((item) => item.id === taskId);
    const occurredAt = [...(task?.completionEvents[profileId] ?? [])].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    if (!task || !occurredAt) return;

    updateFamily((current) => ({
      ...current,
      tasks: current.tasks.map((item) => {
        if (item.id !== taskId) return item;
        return removeTaskCompletion(item, profileId, occurredAt);
      }),
      completionRequests: current.completionRequests.map((request) =>
        request.taskId === taskId && request.profileId === profileId && request.status === 'approved' && request.requestedAt === occurredAt
          ? { ...request, status: 'pending', reviewedAt: undefined }
          : request
      ),
    }));
    enqueue({ id: makeId('mutation'), type: 'undo_task', payload: { taskId, profileId, occurredAt } });
  }, [enqueue, family.tasks, updateFamily]);

  const undoLatestTaskCompletion = useCallback((profileId: string) => {
    const latest = family.tasks.flatMap((task) =>
      (task.completionEvents[profileId] ?? []).map((occurredAt) => ({ taskId: task.id, occurredAt }))
    ).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
    if (!latest) return;

    updateFamily((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== latest.taskId) return task;
        return removeTaskCompletion(task, profileId, latest.occurredAt);
      }),
      completionRequests: current.completionRequests.map((request) =>
        request.taskId === latest.taskId && request.profileId === profileId && request.status === 'approved' && request.requestedAt === latest.occurredAt
          ? { ...request, status: 'pending', reviewedAt: undefined }
          : request
      ),
    }));
    enqueue({ id: makeId('mutation'), type: 'undo_task', payload: { taskId: latest.taskId, profileId, occurredAt: latest.occurredAt } });
  }, [enqueue, family.tasks, updateFamily]);

  const requestTaskCompletion = useCallback((taskId: string, profileId: string, requestedAt = new Date().toISOString()) => {
    const task = family.tasks.find((item) => item.id === taskId);
    const requestDate = new Date(requestedAt);
    if (!task || !canCompleteTask(task, profileId, requestDate)) return '';
    const periodKey = getTaskPeriodKey(task.frequency, requestDate);
    const alreadyHandled = task.frequency !== 'unlimited' && family.completionRequests.some((request) =>
      request.taskId === taskId && request.profileId === profileId && request.status !== 'denied'
      && (request.periodKey ?? getTaskPeriodKey(task.frequency, new Date(request.requestedAt))) === periodKey
    );
    if (alreadyHandled) return '';

    const requestId = makeId('request');
    const localDate = toDateKey(requestDate);
    const tapKey = `request:${taskId}:${profileId}`;
    if (taskTapGuardRef.current.has(tapKey)) return '';
    taskTapGuardRef.current.add(tapKey);
    setTimeout(() => taskTapGuardRef.current.delete(tapKey), 750);

    updateFamily((current) => ({
      ...current,
      completionRequests: [
        ...current.completionRequests.filter((request) =>
          !(request.taskId === taskId && request.profileId === profileId && request.status === 'pending')
        ),
        { id: requestId, taskId, profileId, requestedAt, periodKey, status: 'pending' },
      ],
    }));
    enqueue({ id: makeId('mutation'), type: 'request_task', payload: { requestId, taskId, profileId, requestedAt, periodKey, localDate } });
    return requestId;
  }, [enqueue, family.completionRequests, family.tasks, updateFamily]);

  const resolveTaskRequest = useCallback((requestId: string, status: Exclude<TaskCompletionRequestStatus, 'pending'>, reviewedAt = new Date().toISOString()) => {
    const completionId = makeId('completion');
    updateFamily((current) => {
      const request = current.completionRequests.find((item) => item.id === requestId);
      if (!request || request.status !== 'pending') return current;
      let tasks = current.tasks;
      if (status === 'approved') {
        tasks = current.tasks.map((task) => task.id !== request.taskId ? task : recordTaskCompletion(task, request.profileId, request.requestedAt, true));
      }
      return {
        ...current,
        tasks,
        completionRequests: current.completionRequests.map((item) => item.id === requestId ? { ...item, status, reviewedAt } : item),
      };
    });
    enqueue({ id: makeId('mutation'), type: 'resolve_task', payload: { requestId, status, completionId } });
  }, [enqueue, updateFamily]);

  const addReward = useCallback((input: NewRewardInput) => {
    const reward: ChildReward = {
      id: makeId('reward'),
      title: input.title.trim(),
      cost: Math.max(1, input.cost),
      icon: input.icon,
      assignedProfileIds: Array.from(new Set(input.profileIds ?? [])),
      redemptionEvents: {},
      createdAt: new Date().toISOString(),
    };
    updateFamily((current) => ({ ...current, rewards: [...current.rewards, reward] }));
    enqueue({ id: makeId('mutation'), type: 'add_reward', payload: { reward } });
    return reward.id;
  }, [enqueue, updateFamily]);

  const updateReward = useCallback((rewardId: string, input: NewRewardInput) => {
    const reward = familyRef.current.rewards.find((item) => item.id === rewardId);
    if (!reward) return;
    const updated = { ...reward, title: input.title.trim(), cost: Math.max(1, input.cost), icon: input.icon, assignedProfileIds: Array.from(new Set(input.profileIds ?? reward.assignedProfileIds)) };
    updateFamily((current) => ({ ...current, rewards: current.rewards.map((item) => item.id === rewardId ? updated : item) }));
    enqueue({ id: makeId('mutation'), type: 'update_reward', payload: { reward: updated } });
  }, [enqueue, updateFamily]);

  const deleteReward = useCallback((rewardId: string) => {
    updateFamily((current) => ({
      ...current,
      rewards: current.rewards.map((reward) => reward.id === rewardId
        ? { ...reward, assignedProfileIds: [], archivedAt: new Date().toISOString() }
        : reward),
    }));
    enqueue({ id: makeId('mutation'), type: 'delete_reward', payload: { rewardId } });
  }, [enqueue, updateFamily]);

  const setRewardAssigned = useCallback((rewardId: string, profileId: string, assigned: boolean) => {
    updateFamily((current) => ({
      ...current,
      rewards: current.rewards.map((reward) => {
        if (reward.id !== rewardId) return reward;
        const nextAssigned = assigned
          ? Array.from(new Set([...reward.assignedProfileIds, profileId]))
          : reward.assignedProfileIds.filter((id) => id !== profileId);
        return { ...reward, assignedProfileIds: nextAssigned };
      }),
    }));
    enqueue({ id: makeId('mutation'), type: 'set_reward_assignment', payload: { rewardId, profileId, assigned } });
  }, [enqueue, updateFamily]);

  const redeemReward = useCallback((rewardId: string, profileId: string, occurredAt = new Date().toISOString(), deliverToChild = true, allowEarly = false) => {
    const redemptionId = makeId('redemption');
    const deliveryId = makeId('delivery');
    updateFamily((current) => {
      const profile = current.profiles.find((item) => item.id === profileId);
      const reward = current.rewards.find((item) => item.id === rewardId);
      if (!profile || !reward || !reward.assignedProfileIds.includes(profileId)) return current;
      const balanceBefore = getProfileBalance(profile, current.tasks, current.rewards);
      if (balanceBefore < reward.cost && !allowEarly) return current;
      const chargedAmount = allowEarly ? balanceBefore : reward.cost;
      const balanceAfter = Math.max(0, balanceBefore - chargedAmount);
      return {
        ...current,
        profiles: allowEarly
          ? current.profiles.map((item) => item.id === profileId ? { ...item, balanceResetEvents: [...(item.balanceResetEvents ?? []), occurredAt] } : item)
          : current.profiles,
        rewards: current.rewards.map((item) => item.id !== rewardId ? item : {
          ...item,
          redemptionEvents: { ...item.redemptionEvents, [profileId]: [...(item.redemptionEvents[profileId] ?? []), occurredAt] },
          redemptionAccountingEvents: { ...item.redemptionAccountingEvents, [profileId]: [...(item.redemptionAccountingEvents?.[profileId] ?? item.redemptionEvents[profileId] ?? []), occurredAt] },
          redemptionCosts: { ...(item.redemptionCosts ?? {}), [profileId]: [...(item.redemptionCosts?.[profileId] ?? []), chargedAmount] },
        }),
        rewardDeliveries: deliverToChild ? [...current.rewardDeliveries, {
          id: deliveryId,
          rewardId: reward.id,
          rewardTitle: reward.title,
          rewardIcon: reward.icon,
          profileId,
          cost: reward.cost,
          balanceBefore,
          balanceAfter,
          sentAt: occurredAt,
          status: 'waiting',
        }] : current.rewardDeliveries,
      };
    });
    const rewardSnapshot = family.rewards.find((item) => item.id === rewardId);
    enqueue({ id: makeId('mutation'), type: 'redeem_reward', payload: { redemptionId, deliveryId, rewardId, profileId, deliverToChild, redeemedAt: occurredAt, allowEarly, reward: rewardSnapshot } });
    return deliveryId;
  }, [enqueue, family.rewards, updateFamily]);

  const openRewardDelivery = useCallback((deliveryId: string, openedAt = new Date().toISOString()) => {
    updateFamily((current) => ({
      ...current,
      rewardDeliveries: current.rewardDeliveries.map((delivery) => delivery.id === deliveryId && delivery.status === 'waiting' ? { ...delivery, status: 'opened', openedAt } : delivery),
    }));
    enqueue({ id: makeId('mutation'), type: 'open_delivery', payload: { deliveryId } });
  }, [enqueue, updateFamily]);

  const retryPendingChanges = useCallback(async () => {
    await flushQueue();
    if (queueRef.current.length === 0) await refresh();
  }, [flushQueue, refresh]);

  const retryFailedSyncChange = useCallback(async (id: string) => {
    const failed = failedRef.current.find((item) => item.id === id);
    if (!failed) return;
    failedRef.current = failedRef.current.filter((item) => item.id !== id);
    queueRef.current = [...queueRef.current, failed.mutation];
    setPendingMutationCount(queueRef.current.length);
    await Promise.all([persistFailed(), persistQueue()]);
    await flushQueue();
  }, [flushQueue, persistFailed, persistQueue]);

  const retryAllFailedSyncChanges = useCallback(async () => {
    if (!failedRef.current.length) return;
    queueRef.current = [...queueRef.current, ...failedRef.current.map((item) => item.mutation)];
    setPendingMutationCount(queueRef.current.length);
    failedRef.current = [];
    await Promise.all([persistFailed(), persistQueue()]);
    await flushQueue();
  }, [flushQueue, persistFailed, persistQueue]);

  const discardFailedSyncChange = useCallback(async (id: string) => {
    failedRef.current = failedRef.current.filter((item) => item.id !== id);
    await persistFailed();
    await refresh();
    if (!failedRef.current.length && !queueRef.current.length) setSyncError(null);
  }, [persistFailed, refresh]);


  const resetCloudSync = useCallback(async () => {
    if (!scope.isActive() || flushingRef.current) return false;
    flushingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      queueRef.current = [];
      setPendingMutationCount(0);
      failedRef.current = [];
      setFailedSyncChanges([]);
      await storageWritesRef.current.catch(() => undefined);
      if (!scope.isActive()) return false;
      await AsyncStorage.multiRemove([
        queueKey(workspaceId, userId),
        failedKey(workspaceId, userId),
        cacheKey(workspaceId, userId),
      ]);
      const next = await fetchCloudFamilyState(workspaceId, await sessionClient());
      if (!scope.isActive()) return false;
      applySnapshot(next);
      setSyncError(null);
      setSyncStatus('synced');
      return true;
    } catch (error) {
      if (!scope.isActive()) return false;
      setSyncError(errorMessage(error));
      setSyncStatus('offline');
      return false;
    } finally {
      flushingRef.current = false;
    }
  }, [workspaceId]);

  const resetAllData = useCallback(() => {
    const snapshot = family;
    for (const task of snapshot.tasks) deleteTask(task.id);
    for (const reward of snapshot.rewards) deleteReward(reward.id);
    for (const profile of snapshot.profiles) deleteProfile(profile.id);
  }, [deleteProfile, deleteReward, deleteTask, family]);

  return useMemo(() => ({
    ...family,
    isHydrated,
    syncStatus,
    syncError,
    pendingMutationCount,
    failedSyncChanges,
    refresh,
    retryPendingChanges,
    retryFailedSyncChange,
    retryAllFailedSyncChanges,
    discardFailedSyncChange,
    resetCloudSync,
    addProfile,
    updateProfile,
    updateOwnProfilePreferences,
    deleteProfile,
    addTask, updateTask,
    deleteTask,
    setTaskAssigned,
    completeTask,
    undoLatestTaskCompletion,
    undoTaskCompletion,
    requestTaskCompletion,
    resolveTaskRequest,
    addReward, updateReward,
    deleteReward,
    setRewardAssigned,
    redeemReward,
    openRewardDelivery,
    resetAllData,
  }), [family, isHydrated, syncStatus, syncError, pendingMutationCount, failedSyncChanges, refresh, retryPendingChanges, retryFailedSyncChange, retryAllFailedSyncChanges, discardFailedSyncChange, resetCloudSync, addProfile, updateProfile, updateOwnProfilePreferences, deleteProfile, addTask, updateTask, deleteTask, setTaskAssigned, completeTask, undoLatestTaskCompletion, undoTaskCompletion, requestTaskCompletion, resolveTaskRequest, addReward, updateReward, deleteReward, setRewardAssigned, redeemReward, openRewardDelivery, resetAllData]);
}
