import type {
  AvatarKey,
  ChildProfile,
  ChildReward,
  ChildTask,
  CurrencyType,
  FamilyState,
  ItemIcon,
  ProfileAvatar,
  ProfileColorKey,
  ProfilePattern,
  RewardDelivery,
  StorageType,
  TaskCompletionRequest,
  TaskFrequency,
} from '../types';

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function eventToDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  const dayFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayFromMonday);
  return start;
}

export function getTaskPeriodKey(frequency: TaskFrequency, date = new Date()) {
  if (frequency === 'unlimited') return `event-${date.toISOString()}`;
  if (frequency === 'daily' || frequency === 'custom') return `day-${toDateKey(date)}`;
  if (frequency === 'monthly') return `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `week-${toDateKey(startOfWeek(date))}`;
}

export function getTaskEvents(task: ChildTask, profileId: string) {
  return task.completionEvents[profileId] ?? [];
}

export function isTaskAssignedToProfile(task: ChildTask, profileId: string) {
  return !task.archivedAt && task.assignedProfileIds.includes(profileId);
}

export function archiveTask(task: ChildTask, archivedAt = new Date().toISOString()): ChildTask {
  return { ...task, assignedProfileIds: [], archivedAt };
}

export function taskAppearsOnDate(task: ChildTask, date: Date) {
  if (task.frequency === 'unlimited' || task.frequency === 'daily' || task.frequency === 'monthly') return true;
  if (task.frequency === 'weekly') {
    const scheduledDays = task.scheduleDays?.length ? task.scheduleDays : [eventToDate(task.createdAt).getDay()];
    return scheduledDays.includes(date.getDay());
  }
  return (task.scheduleDates ?? []).includes(toDateKey(date));
}

export function hasTaskCompletionForPeriod(task: ChildTask, profileId: string, date = new Date()) {
  if (task.frequency === 'unlimited') return false;
  const target = getTaskPeriodKey(task.frequency, date);
  if ((task.completionPeriods?.[profileId] ?? []).includes(target)) return true;
  return getTaskEvents(task, profileId).some((event) => getTaskPeriodKey(task.frequency, eventToDate(event)) === target);
}

export function canCompleteTask(task: ChildTask, profileId: string, date = new Date()) {
  if (!isTaskAssignedToProfile(task, profileId)) return false;
  if (task.frequency !== 'unlimited' && !taskAppearsOnDate(task, date)) return false;
  return task.frequency === 'unlimited' || !hasTaskCompletionForPeriod(task, profileId, date);
}

export function recordTaskCompletion(task: ChildTask, profileId: string, occurredAt: string, ensureAssigned = false, allowRepeatDaily = false) {
  const completionDate = eventToDate(occurredAt);
  const assigned = task.assignedProfileIds.includes(profileId);
  if (!assigned && !ensureAssigned) return task;
  const repeatingCompletedDaily = allowRepeatDaily && task.frequency === 'daily';
  if (task.frequency !== 'unlimited' && hasTaskCompletionForPeriod(task, profileId, completionDate) && !repeatingCompletedDaily) return task;

  const periodKey = getTaskPeriodKey(task.frequency, completionDate);
  const currentEvents = task.completionEvents[profileId] ?? [];
  if (currentEvents.includes(occurredAt)) return task;
  const currentAmounts = task.completionAmounts?.[profileId] ?? currentEvents.map(() => task.amount);
  return {
    ...task,
    assignedProfileIds: assigned ? task.assignedProfileIds : [...task.assignedProfileIds, profileId],
    completionEvents: {
      ...task.completionEvents,
      [profileId]: [...currentEvents, occurredAt],
    },
    completionAmounts: {
      ...task.completionAmounts,
      [profileId]: [...currentAmounts, task.amount],
    },
    completionPeriods: {
      ...task.completionPeriods,
      [profileId]: [...new Set([...(task.completionPeriods?.[profileId] ?? []), periodKey])],
    },
  };
}

export function removeTaskCompletion(task: ChildTask, profileId: string, occurredAt?: string) {
  const currentEvents = task.completionEvents[profileId] ?? [];
  const target = occurredAt ?? [...currentEvents].sort((a, b) => eventToDate(b).getTime() - eventToDate(a).getTime())[0];
  if (!target || !currentEvents.includes(target)) return task;

  const nextEvents = [...currentEvents];
  const removalIndex = nextEvents.lastIndexOf(target);
  nextEvents.splice(removalIndex, 1);
  const nextAmounts = [...(task.completionAmounts?.[profileId] ?? currentEvents.map(() => task.amount))];
  nextAmounts.splice(removalIndex, 1);
  const targetPeriod = getTaskPeriodKey(task.frequency, eventToDate(target));
  const periodStillPresent = nextEvents.some((event) => getTaskPeriodKey(task.frequency, eventToDate(event)) === targetPeriod);
  const nextPeriods = periodStillPresent
    ? task.completionPeriods?.[profileId] ?? []
    : (task.completionPeriods?.[profileId] ?? []).filter((period) => period !== targetPeriod);

  return {
    ...task,
    completionEvents: { ...task.completionEvents, [profileId]: nextEvents },
    completionAmounts: { ...task.completionAmounts, [profileId]: nextAmounts },
    completionPeriods: { ...task.completionPeriods, [profileId]: nextPeriods },
  };
}

export function formatTaskFrequency(frequency: TaskFrequency) {
  if (frequency === 'unlimited') return 'Unlimited';
  if (frequency === 'daily') return 'Daily';
  if (frequency === 'weekly') return 'Weekly';
  if (frequency === 'monthly') return 'Monthly';
  return 'Custom';
}

const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatTaskSchedule(task: ChildTask) {
  if (task.frequency === 'unlimited') return 'Available anytime';
  if (task.frequency === 'daily') return 'Every day';
  if (task.frequency === 'monthly') return 'Once each calendar month';
  if (task.frequency === 'weekly') {
    const days = task.scheduleDays?.length ? task.scheduleDays : [eventToDate(task.createdAt).getDay()];
    return days.map((day) => SHORT_DAY_NAMES[day]).join(', ');
  }
  const dates = task.scheduleDates ?? [];
  if (dates.length === 0) return 'No dates selected';
  const labels = dates.slice(0, 3).map((date) => eventToDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  return `${labels.join(', ')}${dates.length > 3 ? ` +${dates.length - 3}` : ''}`;
}

export function getRewardEvents(reward: ChildReward, profileId: string) {
  return reward.redemptionEvents[profileId] ?? [];
}

export function isRewardAssignedToProfile(reward: ChildReward, profileId: string) {
  return !reward.archivedAt && reward.assignedProfileIds.includes(profileId);
}

export function getProfileEarnedAmount(profile: ChildProfile, tasks: ChildTask[]) {
  return tasks.reduce((total, task) => {
    const events = getTaskEvents(task, profile.id);
    const recordedAmounts = task.completionAmounts?.[profile.id] ?? [];
    return total + events.reduce((sum, _event, index) => sum + Math.max(0, recordedAmounts[index] ?? task.amount), 0);
  }, profile.startingBalance);
}

export function getProfileSpentAmount(profileId: string, rewards: ChildReward[]) {
  return rewards.reduce((total, reward) => {
    const events = getRewardEvents(reward, profileId);
    const charged = reward.redemptionCosts?.[profileId];
    if (charged && charged.length === events.length) return total + charged.reduce((sum, amount) => sum + Math.max(0, amount), 0);
    return total + events.length * reward.cost;
  }, 0);
}

export function getProfileBalance(profile: ChildProfile, tasks: ChildTask[], rewards: ChildReward[] = []) {
  type BalanceEvent = { occurredAt: string; amount: number; kind: 'earn' | 'spend' | 'reset' };
  const events: BalanceEvent[] = [];

  for (const occurredAt of profile.balanceResetEvents ?? []) {
    events.push({ occurredAt, amount: 0, kind: 'reset' });
  }

  for (const task of tasks) {
    const taskEvents = getTaskEvents(task, profile.id);
    const recordedAmounts = task.completionAmounts?.[profile.id] ?? [];
    taskEvents.forEach((occurredAt, index) => {
      events.push({ occurredAt, amount: Math.max(0, recordedAmounts[index] ?? task.amount), kind: 'earn' });
    });
  }

  for (const reward of rewards) {
    const redemptions = getRewardEvents(reward, profile.id);
    const recordedCosts = reward.redemptionCosts?.[profile.id] ?? [];
    redemptions.forEach((occurredAt, index) => {
      const accountingAt = reward.redemptionAccountingEvents?.[profile.id]?.[index] ?? occurredAt;
      const recorded = recordedCosts[index];
      const amount = typeof recorded === 'number' && recorded >= 0 ? recorded : reward.cost;
      events.push({ occurredAt: accountingAt, amount: Math.max(0, amount), kind: 'spend' });
    });
  }

  events.sort((a, b) => {
    const time = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (time !== 0) return time;
    const rank = { earn: 0, reset: 1, spend: 2 } as const;
    return rank[a.kind] - rank[b.kind];
  });

  let balance = Math.max(0, profile.startingBalance);
  for (const event of events) {
    if (event.kind === 'earn') {
      balance += event.amount;
    } else if (event.kind === 'reset') {
      balance = 0;
    } else {
      balance = Math.max(0, balance - Math.min(balance, event.amount));
    }
  }

  return balance;
}

export function canRedeemReward(reward: ChildReward, profile: ChildProfile, tasks: ChildTask[], rewards: ChildReward[]) {
  return isRewardAssignedToProfile(reward, profile.id) && getProfileBalance(profile, tasks, rewards) >= reward.cost;
}

export function getNextRewardProgress(profile: ChildProfile, tasks: ChildTask[], rewards: ChildReward[]) {
  const balance = getProfileBalance(profile, tasks, rewards);
  const assigned = rewards
    .filter((reward) => isRewardAssignedToProfile(reward, profile.id))
    .sort((a, b) => a.cost - b.cost);
  const reward = assigned.find((item) => item.cost > balance) ?? assigned[assigned.length - 1] ?? null;
  const percent = reward ? Math.min(100, Math.round((balance / reward.cost) * 100)) : 0;
  return { balance, reward, percent };
}

export function getTasksForDate(profileId: string, tasks: ChildTask[], date = new Date()) {
  return tasks.filter((task) => isTaskAssignedToProfile(task, profileId) && taskAppearsOnDate(task, date));
}

export function getTodayProgress(profileId: string, tasks: ChildTask[], date = new Date()) {
  const scheduled = getTasksForDate(profileId, tasks, date).filter((task) => task.frequency !== 'unlimited');
  const completed = scheduled.filter((task) => hasTaskCompletionForPeriod(task, profileId, date)).length;
  const total = scheduled.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

function isCurrencyType(value: unknown): value is CurrencyType {
  return value === 'stars' || value === 'marbles' || value === 'points' || value === 'coins' || value === 'dollars';
}

function isStorageType(value: unknown): value is StorageType {
  return value === 'glassJar' || value === 'piggyBank' || value === 'treasureChest';
}

function normalizeColorKey(value: unknown): ProfileColorKey {
  if (value === 'blue' || value === 'pink' || value === 'red' || value === 'green' || value === 'gold' || value === 'yellow' || value === 'purple' || value === 'teal') return value;
  if (value === 'secondary') return 'teal';
  if (value === 'success') return 'green';
  if (value === 'reward') return 'gold';
  return 'purple';
}

function normalizePattern(value: unknown): ProfilePattern {
  return value === 'striped' || value === 'polka' ? value : 'solid';
}

function normalizeFrequency(value: unknown): TaskFrequency {
  if (value === 'unlimited' || value === 'daily' || value === 'weekly' || value === 'custom') return value;
  return value === 'monthly' ? 'custom' : 'weekly';
}

function normalizeAvatar(value: unknown): ProfileAvatar {
  const avatar = value as { type?: unknown; key?: unknown; uri?: unknown } | null;
  if (avatar?.type === 'photo' && typeof avatar.uri === 'string') return { type: 'photo', uri: avatar.uri };
  if (avatar?.type === 'preset' && typeof avatar.key === 'string') return { type: 'preset', key: avatar.key as AvatarKey };
  return { type: 'preset', key: 'avatar-01' };
}

function normalizeItemIcon(value: unknown, fallback: string): ItemIcon {
  if (typeof value === 'string') return { type: 'preset', value };
  const icon = value as { type?: unknown; value?: unknown; uri?: unknown } | null;
  if (icon?.type === 'photo' && typeof icon.uri === 'string') return { type: 'photo', uri: icon.uri };
  if (icon?.type === 'preset' && typeof icon.value === 'string') return { type: 'preset', value: icon.value };
  return { type: 'preset', value: fallback };
}

function normalizeEventMap(value: unknown, profileIds: string[]) {
  const result: Record<string, string[]> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value as Record<string, unknown>).forEach(([profileId, events]) => {
      if (!profileIds.includes(profileId) || !Array.isArray(events)) return;
      result[profileId] = events.filter((event): event is string => typeof event === 'string');
    });
  }
  return result;
}

const LEGACY_SAMPLE_PROFILE_IDS = new Set(['profile-mia', 'profile-noah', 'profile-lily']);

export function normalizeFamilyState(value: unknown): FamilyState {
  const raw = value as { profiles?: unknown[] | null; tasks?: unknown[] | null; rewards?: unknown[] | null; completionRequests?: unknown[] | null; rewardDeliveries?: unknown[] | null } | null;
  if (!raw || !Array.isArray(raw.profiles) || !Array.isArray(raw.tasks) || !Array.isArray(raw.rewards)) return createInitialFamilyState();

  const profiles: ChildProfile[] = raw.profiles
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((profile) => ({
      id: typeof profile.id === 'string' ? profile.id : makeId('profile'),
      name: typeof profile.name === 'string' ? profile.name : 'Child',
      avatar: normalizeAvatar(profile.avatar),
      colorKey: normalizeColorKey(profile.colorKey),
      pattern: normalizePattern(profile.pattern),
      currencyType: isCurrencyType(profile.currencyType) ? profile.currencyType : 'stars',
      storageType: profile.storageType === 'largeStar' ? 'treasureChest' : (isStorageType(profile.storageType) ? profile.storageType : 'glassJar'),
      startingBalance: typeof profile.startingBalance === 'number' ? profile.startingBalance : typeof profile.startingStars === 'number' ? profile.startingStars : 0,
      balanceResetEvents: Array.isArray(profile.balanceResetEvents)
        ? profile.balanceResetEvents.filter((value): value is string => typeof value === 'string')
        : [],
      createdAt: typeof profile.createdAt === 'string' ? profile.createdAt : new Date().toISOString(),
    }))
    .filter((profile) => !LEGACY_SAMPLE_PROFILE_IDS.has(profile.id));

  const validProfileIds = profiles.map((profile) => profile.id);
  const profileIdSet = new Set(validProfileIds);
  const tasks: ChildTask[] = raw.tasks
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((task) => {
      const legacyProfileId = typeof task.profileId === 'string' && profileIdSet.has(task.profileId) ? task.profileId : null;
      const assignedProfileIds = Array.isArray(task.assignedProfileIds)
        ? task.assignedProfileIds.filter((id): id is string => typeof id === 'string' && profileIdSet.has(id))
        : legacyProfileId ? [legacyProfileId] : [];
      const legacyCompleted = Array.isArray(task.completedDates) ? task.completedDates.filter((date): date is string => typeof date === 'string') : [];
      // Completion history belongs to the child, even when the task is no
      // longer assigned. Keeping it preserves both history and earned value.
      const completionEvents = normalizeEventMap(task.completionEvents, validProfileIds);
      const completionPeriods = normalizeEventMap(task.completionPeriods, validProfileIds);
      const completionAmounts = task.completionAmounts && typeof task.completionAmounts === 'object'
        ? Object.fromEntries(Object.entries(task.completionAmounts as Record<string, unknown>)
            .filter(([profileId]) => profileIdSet.has(profileId))
            .map(([profileId, values]) => [profileId, Array.isArray(values) ? values.filter((value): value is number => typeof value === 'number' && value >= 0) : []]))
        : undefined;
      if (legacyProfileId && legacyCompleted.length > 0 && !completionEvents[legacyProfileId]) completionEvents[legacyProfileId] = legacyCompleted;
      const legacyDays = Array.isArray(task.days) ? task.days.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6) : undefined;
      const frequency = normalizeFrequency(task.frequency ?? (legacyDays?.length === 7 ? 'daily' : 'weekly'));
      const createdAt = typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString();
      const scheduleDates = Array.isArray(task.scheduleDates)
        ? task.scheduleDates.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
        : frequency === 'custom' ? [toDateKey(eventToDate(createdAt))] : undefined;

      return {
        id: typeof task.id === 'string' ? task.id : makeId('task'),
        title: typeof task.title === 'string' ? task.title : 'Task',
        amount: typeof task.amount === 'number' ? Math.max(1, task.amount) : typeof task.stars === 'number' ? Math.max(1, task.stars) : 1,
        frequency,
        description: typeof task.description === 'string' ? task.description : undefined,
        icon: normalizeItemIcon(task.icon, '✓'),
        assignedProfileIds: Array.from(new Set(assignedProfileIds)),
        completionEvents,
        completionAmounts,
        completionPeriods,
        createdAt,
        archivedAt: typeof task.archivedAt === 'string' ? task.archivedAt : undefined,
        scheduleDays: frequency === 'weekly' ? (Array.isArray(task.scheduleDays) ? task.scheduleDays.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6) : legacyDays) : undefined,
        scheduleDates,
        scheduleLabel: typeof task.time === 'string' ? task.time : typeof task.scheduleLabel === 'string' ? task.scheduleLabel : undefined,
      } satisfies ChildTask;
    });

  const rewards: ChildReward[] = raw.rewards
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((reward) => {
      const legacyProfileId = typeof reward.profileId === 'string' && profileIdSet.has(reward.profileId) ? reward.profileId : null;
      const assignedProfileIds = Array.isArray(reward.assignedProfileIds)
        ? reward.assignedProfileIds.filter((id): id is string => typeof id === 'string' && profileIdSet.has(id))
        : legacyProfileId ? [legacyProfileId] : [];
      return {
        id: typeof reward.id === 'string' ? reward.id : makeId('reward'),
        title: typeof reward.title === 'string' ? reward.title : 'Reward',
        cost: typeof reward.cost === 'number' ? Math.max(1, reward.cost) : 1,
        icon: normalizeItemIcon(reward.icon, '🎁'),
        assignedProfileIds: Array.from(new Set(assignedProfileIds)),
        redemptionEvents: normalizeEventMap(reward.redemptionEvents, validProfileIds),
        redemptionAccountingEvents: reward.redemptionAccountingEvents
          ? normalizeEventMap(reward.redemptionAccountingEvents, validProfileIds) : undefined,
        redemptionCosts: reward.redemptionCosts && typeof reward.redemptionCosts === 'object'
          ? Object.fromEntries(Object.entries(reward.redemptionCosts as Record<string, unknown>)
              .filter(([profileId]) => profileIdSet.has(profileId))
              .map(([profileId, values]) => [profileId, Array.isArray(values) ? values.filter((value): value is number => typeof value === 'number' && value >= 0) : []]))
          : undefined,
        createdAt: typeof reward.createdAt === 'string' ? reward.createdAt : new Date().toISOString(),
        archivedAt: typeof reward.archivedAt === 'string' ? reward.archivedAt : undefined,
      } satisfies ChildReward;
    });

  const taskIds = new Set(tasks.map((task) => task.id));
  const completionRequests: TaskCompletionRequest[] = Array.isArray(raw.completionRequests)
    ? raw.completionRequests
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .filter((request) => typeof request.taskId === 'string' && taskIds.has(request.taskId) && typeof request.profileId === 'string' && profileIdSet.has(request.profileId))
        .map((request) => ({
          id: typeof request.id === 'string' ? request.id : makeId('request'),
          taskId: request.taskId as string,
          profileId: request.profileId as string,
          requestedAt: typeof request.requestedAt === 'string' ? request.requestedAt : new Date().toISOString(),
          status: request.status === 'approved' || request.status === 'denied' ? request.status : 'pending',
          periodKey: typeof request.periodKey === 'string' ? request.periodKey : undefined,
          reviewedAt: typeof request.reviewedAt === 'string' ? request.reviewedAt : undefined,
        }))
    : [];

  const rewardDeliveries: RewardDelivery[] = Array.isArray(raw.rewardDeliveries)
    ? raw.rewardDeliveries
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .filter((delivery) => typeof delivery.profileId === 'string' && profileIdSet.has(delivery.profileId))
        .map((delivery) => ({
          id: typeof delivery.id === 'string' ? delivery.id : makeId('delivery'),
          rewardId: typeof delivery.rewardId === 'string' ? delivery.rewardId : 'deleted-reward',
          rewardTitle: typeof delivery.rewardTitle === 'string' ? delivery.rewardTitle : 'Reward',
          rewardIcon: normalizeItemIcon(delivery.rewardIcon, '🎁'),
          profileId: delivery.profileId as string,
          cost: typeof delivery.cost === 'number' ? Math.max(1, delivery.cost) : 1,
          balanceBefore: typeof delivery.balanceBefore === 'number' ? Math.max(0, delivery.balanceBefore) : 0,
          balanceAfter: typeof delivery.balanceAfter === 'number' ? Math.max(0, delivery.balanceAfter) : 0,
          sentAt: typeof delivery.sentAt === 'string' ? delivery.sentAt : new Date().toISOString(),
          status: delivery.status === 'opened' ? 'opened' : 'waiting',
          openedAt: typeof delivery.openedAt === 'string' ? delivery.openedAt : undefined,
        }))
    : [];

  return { profiles, tasks, rewards, completionRequests, rewardDeliveries };
}

/** Fresh installs intentionally start without sample profiles or assigned data. */
export function createInitialFamilyState(): FamilyState {
  return { profiles: [], tasks: [], rewards: [], completionRequests: [], rewardDeliveries: [] };
}
