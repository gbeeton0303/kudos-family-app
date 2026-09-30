import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { archiveTask, canCompleteTask, createInitialFamilyState, getProfileBalance, getTaskPeriodKey, hasTaskCompletionForPeriod, makeId, normalizeFamilyState, recordTaskCompletion, removeTaskCompletion } from '../data/familyData';
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
import type { FamilyDataController, NewProfileInput } from './familyController';

const STORAGE_KEY = '@brightsteps/family-state-v6';
const LEGACY_STORAGE_KEYS = ['@brightsteps/family-state-v5', '@brightsteps/family-state-v4', '@brightsteps/family-state-v3', '@brightsteps/family-state-v2', '@brightsteps/family-state-v1'];


export function useLocalFamilyData(): FamilyDataController {
  const [family, setFamily] = useState<FamilyState>(() => createInitialFamilyState());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        let saved = await AsyncStorage.getItem(STORAGE_KEY);
        for (const key of LEGACY_STORAGE_KEYS) {
          if (saved) break;
          saved = await AsyncStorage.getItem(key);
        }
        if (saved && mounted) setFamily(normalizeFamilyState(JSON.parse(saved)));
      } catch (error) {
        console.warn('Kudos could not load saved family data.', error);
      } finally {
        if (mounted) setIsHydrated(true);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(family)).catch((error) => {
      console.warn('Kudos could not save family data.', error);
    });
  }, [family, isHydrated]);

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
    setFamily((current) => ({ ...current, profiles: [...current.profiles, profile] }));
    return profile.id;
  }, []);


  const updateProfile = useCallback((profileId: string, input: NewProfileInput) => {
    setFamily((current) => ({ ...current, profiles: current.profiles.map((profile) => profile.id === profileId ? {
      ...profile, name: input.name.trim(), avatar: input.avatar, colorKey: input.colorKey, pattern: input.pattern,
      currencyType: input.currencyType, storageType: input.storageType,
    } : profile) }));
  }, []);

  const updateOwnProfilePreferences = useCallback((profileId: string, input: NewProfileInput) => {
    setFamily((current) => ({ ...current, profiles: current.profiles.map((profile) => profile.id === profileId ? {
      ...profile,
      colorKey: input.colorKey,
      pattern: input.pattern,
      currencyType: input.currencyType,
      storageType: input.storageType,
    } : profile) }));
  }, []);

  const deleteProfile = useCallback((profileId: string) => {
    setFamily((current) => ({
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
  }, []);

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
    setFamily((current) => ({ ...current, tasks: [...current.tasks, task] }));
    return task.id;
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setFamily((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId ? archiveTask(task) : task),
      completionRequests: current.completionRequests.filter((request) => request.taskId !== taskId),
    }));
  }, []);

  const updateTask = useCallback((taskId: string, input: NewTaskInput) => {
    setFamily((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? {
      ...task,
      title: input.title.trim(), amount: Math.max(1, input.amount), frequency: input.frequency,
      description: input.description?.trim() || undefined, icon: input.icon,
      assignedProfileIds: Array.from(new Set(input.profileIds ?? task.assignedProfileIds)),
      scheduleDays: input.frequency === 'weekly' ? Array.from(new Set(input.scheduleDays?.length ? input.scheduleDays : [new Date().getDay()])).sort() : undefined,
      scheduleDates: input.frequency === 'custom' ? Array.from(new Set(input.scheduleDates ?? [])).sort() : undefined,
    } : task) }));
  }, []);

  const setTaskAssigned = useCallback((taskId: string, profileId: string, assigned: boolean) => {
    setFamily((current) => ({
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
  }, []);

  const completeTask = useCallback(async (taskId: string, profileId: string, occurredAt = new Date().toISOString(), allowRepeatDaily = false) => {
    const completionDate = new Date(occurredAt);
    const target = family.tasks.find((task) => task.id === taskId);
    const canRepeat = Boolean(allowRepeatDaily && target?.frequency === 'daily' && target.assignedProfileIds.includes(profileId) && hasTaskCompletionForPeriod(target, profileId, completionDate));
    if (!target || (!canCompleteTask(target, profileId, completionDate) && !canRepeat)) return false;
    setFamily((current) => {
      return {
        ...current,
        tasks: current.tasks.map((task) => task.id !== taskId ? task : recordTaskCompletion(task, profileId, occurredAt, false, canRepeat)),
        completionRequests: current.completionRequests.map((request) =>
          request.taskId === taskId && request.profileId === profileId && request.status === 'pending'
            ? { ...request, status: 'approved', reviewedAt: occurredAt }
            : request,
        ),
      };
    });
    return true;
  }, [family.tasks]);

  const undoTaskCompletion = useCallback((taskId: string, profileId: string) => {
    setFamily((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      const events = task?.completionEvents[profileId] ?? [];
      if (!task || events.length === 0) return current;
      const occurredAt = [...events].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
      const removed = { done: false };
      const tasks = current.tasks.map((item) => {
        if (item.id !== taskId) return item;
        const updated = removeTaskCompletion(item, profileId, occurredAt);
        removed.done = updated !== item;
        return updated;
      });
      if (!removed.done) return current;
      return {
        ...current,
        tasks,
        completionRequests: current.completionRequests.map((request) =>
          request.taskId === taskId && request.profileId === profileId && request.status === 'approved' && request.requestedAt === occurredAt
            ? { ...request, status: 'pending', reviewedAt: undefined }
            : request
        ),
      };
    });
  }, []);

  const undoLatestTaskCompletion = useCallback((profileId: string) => {
    setFamily((current) => {
      const latest = current.tasks.flatMap((task) =>
        (task.completionEvents[profileId] ?? []).map((occurredAt) => ({ taskId: task.id, occurredAt }))
      ).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
      if (!latest) return current;
      const tasks = current.tasks.map((task) => {
        if (task.id !== latest.taskId) return task;
        return removeTaskCompletion(task, profileId, latest.occurredAt);
      });
      return {
        ...current,
        tasks,
        completionRequests: current.completionRequests.map((request) =>
          request.taskId === latest.taskId && request.profileId === profileId && request.status === 'approved' && request.requestedAt === latest.occurredAt
            ? { ...request, status: 'pending', reviewedAt: undefined }
            : request
        ),
      };
    });
  }, []);

  const requestTaskCompletion = useCallback((taskId: string, profileId: string, requestedAt = new Date().toISOString()) => {
    const task = family.tasks.find((item) => item.id === taskId);
    const requestDate = new Date(requestedAt);
    if (!task || !canCompleteTask(task, profileId, requestDate)) return '';
    const requestPeriod = getTaskPeriodKey(task.frequency, requestDate);
    const alreadyHandled = task.frequency !== 'unlimited' && family.completionRequests.some((request) =>
      request.taskId === taskId && request.profileId === profileId && request.status !== 'denied'
      && (request.periodKey ?? getTaskPeriodKey(task.frequency, new Date(request.requestedAt))) === requestPeriod
    );
    if (alreadyHandled) return '';
    const requestId = makeId('request');
    setFamily((current) => {
      return {
        ...current,
        completionRequests: [...current.completionRequests, { id: requestId, taskId, profileId, requestedAt, periodKey: requestPeriod, status: 'pending' }],
      };
    });
    return requestId;
  }, [family.completionRequests, family.tasks]);

  const resolveTaskRequest = useCallback((requestId: string, status: Exclude<TaskCompletionRequestStatus, 'pending'>, reviewedAt = new Date().toISOString()) => {
    setFamily((current) => {
      const request = current.completionRequests.find((item) => item.id === requestId);
      if (!request || request.status !== 'pending') return current;
      let tasks = current.tasks;
      if (status === 'approved') {
        tasks = current.tasks.map((task) => {
          if (task.id !== request.taskId || !canCompleteTask(task, request.profileId, new Date(request.requestedAt))) return task;
          return recordTaskCompletion(task, request.profileId, request.requestedAt);
        });
      }
      return {
        ...current,
        tasks,
        completionRequests: current.completionRequests.map((item) => item.id === requestId ? { ...item, status, reviewedAt } : item),
      };
    });
  }, []);

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
    setFamily((current) => ({ ...current, rewards: [...current.rewards, reward] }));
    return reward.id;
  }, []);

  const updateReward = useCallback((rewardId: string, input: NewRewardInput) => {
    setFamily((current) => ({ ...current, rewards: current.rewards.map((reward) => reward.id === rewardId ? {
      ...reward, title: input.title.trim(), cost: Math.max(1, input.cost), icon: input.icon,
      assignedProfileIds: Array.from(new Set(input.profileIds ?? reward.assignedProfileIds)),
    } : reward) }));
  }, []);

  const deleteReward = useCallback((rewardId: string) => {
    setFamily((current) => ({
      ...current,
      rewards: current.rewards.map((reward) => reward.id === rewardId
        ? { ...reward, assignedProfileIds: [], archivedAt: new Date().toISOString() }
        : reward),
    }));
  }, []);

  const setRewardAssigned = useCallback((rewardId: string, profileId: string, assigned: boolean) => {
    setFamily((current) => ({
      ...current,
      rewards: current.rewards.map((reward) => {
        if (reward.id !== rewardId) return reward;
        const nextAssigned = assigned
          ? Array.from(new Set([...reward.assignedProfileIds, profileId]))
          : reward.assignedProfileIds.filter((id) => id !== profileId);
        return { ...reward, assignedProfileIds: nextAssigned };
      }),
    }));
  }, []);

  const redeemReward = useCallback((rewardId: string, profileId: string, occurredAt = new Date().toISOString(), deliverToChild = true, allowEarly = false) => {
    const deliveryId = makeId('delivery');
    setFamily((current) => {
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
          redemptionEvents: {
            ...item.redemptionEvents,
            [profileId]: [...(item.redemptionEvents[profileId] ?? []), occurredAt],
          },
          redemptionCosts: {
            ...(item.redemptionCosts ?? {}),
            [profileId]: [...(item.redemptionCosts?.[profileId] ?? []), chargedAmount],
          },
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
    return deliveryId;
  }, []);

  const openRewardDelivery = useCallback((deliveryId: string, openedAt = new Date().toISOString()) => {
    setFamily((current) => ({
      ...current,
      rewardDeliveries: current.rewardDeliveries.map((delivery) =>
        delivery.id === deliveryId && delivery.status === 'waiting'
          ? { ...delivery, status: 'opened', openedAt }
          : delivery,
      ),
    }));
  }, []);

  const resetAllData = useCallback(() => setFamily(createInitialFamilyState()), []);

  return useMemo(
    () => ({
      ...family,
      isHydrated,
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
    }),
    [family, isHydrated, addProfile, updateProfile, updateOwnProfilePreferences, deleteProfile, addTask, updateTask, deleteTask, setTaskAssigned, completeTask, undoLatestTaskCompletion, undoTaskCompletion, requestTaskCompletion, resolveTaskRequest, addReward, updateReward, deleteReward, setRewardAssigned, redeemReward, openRewardDelivery, resetAllData],
  );
}

export const useFamilyData = useLocalFamilyData;
