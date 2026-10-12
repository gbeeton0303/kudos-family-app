import type {
  ChildProfile,
  ChildReward,
  ChildTask,
  FamilyState,
  ItemIcon,
  NewRewardInput,
  NewTaskInput,
  ProfileAvatar,
  AvatarKey,
  RewardDelivery,
  TaskCompletionRequest,
  TaskCompletionRequestStatus,
} from '../types';
import { createInitialFamilyState, getTaskPeriodKey, makeId, normalizeFamilyState } from '../data/familyData';
import { prepareAvatarForCloud, prepareIconForCloud, signMediaPaths } from './media';
import { requireSupabase } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from './pagination';

export type NewCloudProfileInput = Omit<ChildProfile, 'id' | 'startingBalance' | 'createdAt'>;

function iconFromRow(type: string, value: string, signed: Map<string, string>): ItemIcon {
  return type === 'photo' ? { type: 'photo', uri: signed.get(value) ?? value } : { type: 'preset', value };
}

function avatarFromRow(type: string, value: string, signed: Map<string, string>): ProfileAvatar {
  return type === 'photo' ? { type: 'photo', uri: signed.get(value) ?? value } : { type: 'preset', key: value as AvatarKey };
}

async function readWorkspaceTable(client: SupabaseClient, workspaceId: string, table: string, columns: string, order: string, ascending = true) {
  return readAllPages<any>((from, to) => {
    let query = client.from(table).select(columns, { count: 'exact' }).eq('workspace_id', workspaceId).order(order, { ascending });
    // Stable tie-breaking prevents equal timestamps from skipping/repeating rows.
    query = query.order(table.endsWith('_assignments') ? 'profile_id' : 'id', { ascending: true });
    return query.range(from, to);
  });
}

export async function fetchCloudFamilyState(workspaceId: string, client: SupabaseClient = requireSupabase()): Promise<FamilyState> {
  const [
    profileResult,
    taskResult,
    taskAssignmentResult,
    taskCompletionResult,
    requestResult,
    rewardResult,
    rewardAssignmentResult,
    redemptionResult,
    deliveryResult,
    balanceResetResult,
    ledgerResult,
  ] = await Promise.all([
    readWorkspaceTable(client, workspaceId, 'child_profiles', '*', 'created_at'),
    readWorkspaceTable(client, workspaceId, 'task_templates', '*', 'created_at'),
    readWorkspaceTable(client, workspaceId, 'task_assignments', '*', 'task_id'),
    readWorkspaceTable(client, workspaceId, 'task_completions', '*', 'completed_at'),
    readWorkspaceTable(client, workspaceId, 'task_completion_requests', '*', 'requested_at', false),
    readWorkspaceTable(client, workspaceId, 'reward_templates', '*', 'created_at'),
    readWorkspaceTable(client, workspaceId, 'reward_assignments', '*', 'reward_id'),
    readWorkspaceTable(client, workspaceId, 'reward_redemptions', '*', 'redeemed_at'),
    readWorkspaceTable(client, workspaceId, 'reward_deliveries', '*', 'sent_at', false),
    readWorkspaceTable(client, workspaceId, 'profile_balance_resets', 'id, profile_id, reset_at', 'reset_at'),
    readWorkspaceTable(client, workspaceId, 'currency_ledger', 'id, profile_id, amount, transaction_type, source_id, description, created_at', 'created_at'),
  ]);

  const failure = [profileResult, taskResult, taskAssignmentResult, taskCompletionResult, requestResult, rewardResult, rewardAssignmentResult, redemptionResult, deliveryResult, balanceResetResult, ledgerResult].find((result) => result.error);
  if (failure?.error) throw failure.error;

  const photoPaths = [
    ...(profileResult.data ?? []).filter((row) => row.avatar_type === 'photo').map((row) => row.avatar_value),
    ...(taskResult.data ?? []).filter((row) => row.icon_type === 'photo').map((row) => row.icon_value),
    ...(rewardResult.data ?? []).filter((row) => row.icon_type === 'photo').map((row) => row.icon_value),
    ...(deliveryResult.data ?? []).filter((row) => row.reward_icon_type === 'photo').map((row) => row.reward_icon_value),
  ];
  const signed = await signMediaPaths(photoPaths, client);

  const balanceResets = new Map<string, string[]>();
  const addBalanceReset = (profileId: string, occurredAt: string) => {
    const existing = balanceResets.get(profileId) ?? [];
    if (!existing.includes(occurredAt)) balanceResets.set(profileId, [...existing, occurredAt]);
  };

  for (const row of balanceResetResult.data ?? []) {
    addBalanceReset(row.profile_id, row.reset_at);
  }

  const profiles: ChildProfile[] = (profileResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    avatar: avatarFromRow(row.avatar_type, row.avatar_value, signed),
    colorKey: row.color_key,
    pattern: row.pattern,
    currencyType: row.currency_type,
    storageType: row.storage_type === 'largeStar' ? 'treasureChest' : row.storage_type,
    startingBalance: row.starting_balance,
    balanceResetEvents: balanceResets.get(row.id) ?? [],
    createdAt: row.created_at,
  })) as ChildProfile[];

  const taskAssignments = new Map<string, string[]>();
  for (const row of taskAssignmentResult.data ?? []) {
    taskAssignments.set(row.task_id, [...(taskAssignments.get(row.task_id) ?? []), row.profile_id]);
  }
  const completionEvents = new Map<string, Record<string, string[]>>();
  const completionAmounts = new Map<string, Record<string, number[]>>();
  const completionPeriodKeys = new Map<string, Record<string, string[]>>();
  const completionPeriods = new Set<string>();
  const taskAwardByCompletionId = new Map(
    (ledgerResult.data ?? [])
      .filter((row) => row.source_id && Number(row.amount ?? 0) > 0)
      .map((row) => [row.source_id as string, Math.max(0, Number(row.amount ?? 0))]),
  );
  const taskValueById = new Map((taskResult.data ?? []).map((row) => [row.id, Math.max(1, Number(row.amount ?? 1))]));
  for (const row of taskCompletionResult.data ?? []) {
    const taskMap = completionEvents.get(row.task_id) ?? {};
    taskMap[row.profile_id] = [...(taskMap[row.profile_id] ?? []), row.completed_at];
    completionEvents.set(row.task_id, taskMap);
    const amountMap = completionAmounts.get(row.task_id) ?? {};
    amountMap[row.profile_id] = [
      ...(amountMap[row.profile_id] ?? []),
      taskAwardByCompletionId.get(row.id) ?? taskValueById.get(row.task_id) ?? 1,
    ];
    completionAmounts.set(row.task_id, amountMap);
    if (row.period_key) {
      completionPeriods.add(`${row.task_id}::${row.profile_id}::${row.period_key}`);
      const periodMap = completionPeriodKeys.get(row.task_id) ?? {};
      periodMap[row.profile_id] = [...new Set([...(periodMap[row.profile_id] ?? []), row.period_key])];
      completionPeriodKeys.set(row.task_id, periodMap);
    }
  }
  for (const row of requestResult.data ?? []) {
    const taskRow = (taskResult.data ?? []).find((task) => task.id === row.task_id);
    if (row.status !== 'approved' || !taskRow) continue;
    const requestPeriod = getTaskPeriodKey(taskRow.frequency, new Date(row.requested_at));
    const taskEvents = completionEvents.get(row.task_id)?.[row.profile_id] ?? [];
    if (taskRow.frequency !== 'unlimited' && taskEvents.some((event) => getTaskPeriodKey(taskRow.frequency, new Date(event)) === requestPeriod)) continue;
    const key = `${row.task_id}::${row.profile_id}::${row.period_key ?? requestPeriod}`;
    if (taskRow.frequency === 'unlimited' && completionPeriods.has(key)) continue;
    const taskMap = completionEvents.get(row.task_id) ?? {};
    taskMap[row.profile_id] = [...(taskMap[row.profile_id] ?? []), row.requested_at];
    completionEvents.set(row.task_id, taskMap);
    completionPeriods.add(key);
  }
  const tasks: ChildTask[] = (taskResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    amount: row.amount,
    frequency: row.frequency,
    description: row.description ?? undefined,
    icon: iconFromRow(row.icon_type, row.icon_value, signed),
    assignedProfileIds: taskAssignments.get(row.id) ?? [],
    completionEvents: completionEvents.get(row.id) ?? {},
    completionAmounts: completionAmounts.get(row.id) ?? {},
    completionPeriods: completionPeriodKeys.get(row.id) ?? {},
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    scheduleDays: Array.isArray(row.schedule_days) ? row.schedule_days : [],
    scheduleDates: Array.isArray(row.schedule_dates) ? row.schedule_dates : [],
  })) as ChildTask[];

  // Older app versions hard-deleted task templates, which cascaded their
  // completion rows but intentionally left the awarded currency ledger rows.
  // Rehydrate those orphaned credits as archived history so affected balances
  // and calendar entries are restored after this update.
  const visibleTaskIds = new Set((taskResult.data ?? []).map((row) => row.id));
  const representedCompletionIds = new Set(
    (taskCompletionResult.data ?? []).filter((row) => visibleTaskIds.has(row.task_id)).map((row) => row.id),
  );
  const orphanedTaskHistory: ChildTask[] = (ledgerResult.data ?? [])
    .filter((row) => row.amount > 0 && (!row.source_id || !representedCompletionIds.has(row.source_id)))
    .map((row) => ({
      id: `archived-ledger-${row.id}`,
      title: row.description?.trim() || 'Completed task',
      amount: Math.max(1, Number(row.amount)),
      frequency: 'unlimited',
      icon: { type: 'preset', value: '✓' },
      assignedProfileIds: [],
      completionEvents: { [row.profile_id]: [row.created_at] },
      completionAmounts: { [row.profile_id]: [Math.max(0, Number(row.amount))] },
      completionPeriods: {},
      createdAt: row.created_at,
      archivedAt: row.created_at,
    }));
  tasks.push(...orphanedTaskHistory);

  const rewardAssignments = new Map<string, string[]>();
  for (const row of rewardAssignmentResult.data ?? []) {
    rewardAssignments.set(row.reward_id, [...(rewardAssignments.get(row.reward_id) ?? []), row.profile_id]);
  }
  const redemptionEvents = new Map<string, Record<string, string[]>>();
  const redemptionAccountingEvents = new Map<string, Record<string, string[]>>();
  const redemptionCosts = new Map<string, Record<string, number[]>>();
  for (const row of redemptionResult.data ?? []) {
    const rewardMap = redemptionEvents.get(row.reward_id) ?? {};
    rewardMap[row.profile_id] = [...(rewardMap[row.profile_id] ?? []), row.occurred_at ?? row.redeemed_at];
    redemptionEvents.set(row.reward_id, rewardMap);
    const accountingMap = redemptionAccountingEvents.get(row.reward_id) ?? {};
    accountingMap[row.profile_id] = [...(accountingMap[row.profile_id] ?? []), row.redeemed_at];
    redemptionAccountingEvents.set(row.reward_id, accountingMap);
    const costMap = redemptionCosts.get(row.reward_id) ?? {};
    costMap[row.profile_id] = [...(costMap[row.profile_id] ?? []), Number(row.cost ?? 0)];
    redemptionCosts.set(row.reward_id, costMap);
  }
  const rewards: ChildReward[] = (rewardResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    cost: row.cost,
    icon: iconFromRow(row.icon_type, row.icon_value, signed),
    assignedProfileIds: rewardAssignments.get(row.id) ?? [],
    redemptionEvents: redemptionEvents.get(row.id) ?? {},
    redemptionAccountingEvents: redemptionAccountingEvents.get(row.id) ?? {},
    redemptionCosts: redemptionCosts.get(row.id) ?? {},
    createdAt: row.created_at,
  })) as ChildReward[];

  // A deleted reward template can cascade its redemption rows while the
  // currency ledger correctly retains the points already spent. Represent
  // those debits as hidden archived rewards so the device balance continues
  // to match the server without showing deleted rewards in the library.
  const representedRedemptionIds = new Set((redemptionResult.data ?? []).map((row) => row.id));
  const orphanedRewardHistory: ChildReward[] = (ledgerResult.data ?? [])
    .filter((row) => Number(row.amount ?? 0) < 0 && (!row.source_id || !representedRedemptionIds.has(row.source_id)))
    .map((row) => ({
      id: `archived-ledger-${row.id}`,
      title: row.description?.trim() || 'Redeemed reward',
      cost: Math.max(0, Math.abs(Number(row.amount))),
      icon: { type: 'preset', value: '🏆' },
      assignedProfileIds: [],
      redemptionEvents: { [row.profile_id]: [row.created_at] },
      redemptionCosts: { [row.profile_id]: [Math.max(0, Math.abs(Number(row.amount)))] },
      createdAt: row.created_at,
      archivedAt: row.created_at,
    }));
  rewards.push(...orphanedRewardHistory);

  const completionRequests: TaskCompletionRequest[] = (requestResult.data ?? []).map((row) => ({
    id: row.id,
    taskId: row.task_id,
    profileId: row.profile_id,
    requestedAt: row.requested_at,
    status: row.status,
    periodKey: row.period_key ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
  })) as TaskCompletionRequest[];

  const rewardDeliveries: RewardDelivery[] = (deliveryResult.data ?? []).map((row) => ({
    id: row.id,
    rewardId: row.reward_id,
    rewardTitle: row.reward_title,
    rewardIcon: iconFromRow(row.reward_icon_type, row.reward_icon_value, signed),
    profileId: row.profile_id,
    cost: row.cost,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    sentAt: row.sent_at,
    status: row.status,
    openedAt: row.opened_at ?? undefined,
  })) as RewardDelivery[];

  return normalizeFamilyState({ profiles, tasks, rewards, completionRequests, rewardDeliveries });
}

export async function insertProfile(workspaceId: string, profile: ChildProfile, client: SupabaseClient = requireSupabase()) {
  const avatar = await prepareAvatarForCloud(workspaceId, profile.id, profile.avatar, client);
  const { error } = await client.from('child_profiles').insert({
    id: profile.id,
    workspace_id: workspaceId,
    name: profile.name,
    avatar_type: avatar.type,
    avatar_value: avatar.value,
    color_key: profile.colorKey,
    pattern: profile.pattern,
    currency_type: profile.currencyType,
    storage_type: profile.storageType,
    starting_balance: profile.startingBalance,
    created_at: profile.createdAt,
  });
  if (error) throw error;
}

export async function updateProfile(workspaceId: string, profile: ChildProfile, client: SupabaseClient = requireSupabase()) {
  const avatar = await prepareAvatarForCloud(workspaceId, profile.id, profile.avatar, client);
  const { error } = await client.from('child_profiles').update({ name: profile.name, avatar_type: avatar.type, avatar_value: avatar.value, color_key: profile.colorKey, pattern: profile.pattern, currency_type: profile.currencyType, storage_type: profile.storageType }).eq('id', profile.id);
  if (error) throw error;
}

export async function updateChildProfilePreferences(profile: ChildProfile, client: SupabaseClient = requireSupabase()) {
  const { data, error } = await client.rpc('update_child_profile_preferences', {
    p_profile_id: profile.id,
    p_color_key: profile.colorKey,
    p_pattern: profile.pattern,
    p_currency_type: profile.currencyType,
    p_storage_type: profile.storageType,
  });
  if (error) throw error;
  return data;
}

export async function removeProfile(profileId: string, client: SupabaseClient = requireSupabase()) {
  const { error } = await client.from('child_profiles').delete().eq('id', profileId);
  if (error) throw error;
}

export async function insertTask(workspaceId: string, task: ChildTask, client: SupabaseClient = requireSupabase()) {
  const icon = await prepareIconForCloud(workspaceId, 'tasks', task.id, task.icon, client);
  const { data: userData } = await client.auth.getUser();
  // This mutation must be safe to retry. Previously the template insert could
  // succeed while its assignments failed; every retry then stopped at the
  // duplicate template and the task stayed visible only in the device cache.
  const { error } = await client.from('task_templates').upsert({
    id: task.id,
    workspace_id: workspaceId,
    title: task.title,
    amount: task.amount,
    frequency: task.frequency,
    description: task.description ?? null,
    icon_type: icon.type,
    icon_value: icon.value,
    schedule_days: task.scheduleDays ?? null,
    schedule_dates: task.scheduleDates ?? null,
    created_by: userData.user?.id ?? null,
    created_at: task.createdAt,
  }, { onConflict: 'id' });
  if (error) throw error;
  await reconcileTaskAssignments(workspaceId, task.id, task.assignedProfileIds, client);
}

export async function removeTask(taskId: string, client: SupabaseClient = requireSupabase()) {
  const { error } = await client.from('task_templates').update({ archived_at: new Date().toISOString() }).eq('id', taskId);
  if (error) throw error;
}

export async function updateTask(workspaceId: string, task: ChildTask, client: SupabaseClient = requireSupabase()) {
  const icon = await prepareIconForCloud(workspaceId, 'tasks', task.id, task.icon, client);
  const { error } = await client.from('task_templates').update({
    title: task.title,
    amount: task.amount,
    frequency: task.frequency,
    description: task.description ?? null,
    icon_type: icon.type,
    icon_value: icon.value,
    schedule_days: task.scheduleDays ?? null,
    schedule_dates: task.scheduleDates ?? null,
  }).eq('id', task.id).eq('workspace_id', workspaceId);
  if (error) throw error;
  await reconcileTaskAssignments(workspaceId, task.id, task.assignedProfileIds, client);
}

async function reconcileTaskAssignments(workspaceId: string, taskId: string, profileIds: string[], client: SupabaseClient = requireSupabase()) {
  const desired = [...new Set(profileIds)];

  // Upsert desired rows first so an interrupted edit never temporarily removes
  // every assignment. Then remove only rows that are no longer desired.
  if (desired.length) {
    const { error: upsertError } = await client.from('task_assignments').upsert(
      desired.map((profileId) => ({ workspace_id: workspaceId, task_id: taskId, profile_id: profileId })),
      { onConflict: 'task_id,profile_id' },
    );
    if (upsertError) throw upsertError;
  }

  const { data: existing, error: lookupError } = await client
    .from('task_assignments')
    .select('profile_id')
    .eq('task_id', taskId)
    .eq('workspace_id', workspaceId);
  if (lookupError) throw lookupError;
  const obsolete = (existing ?? []).map((row) => row.profile_id).filter((profileId) => !desired.includes(profileId));
  if (obsolete.length) {
    const { error: removalError } = await client
      .from('task_assignments')
      .delete()
      .eq('task_id', taskId)
      .eq('workspace_id', workspaceId)
      .in('profile_id', obsolete);
    if (removalError) throw removalError;
  }
}

export async function setTaskAssignment(workspaceId: string, taskId: string, profileId: string, assigned: boolean, client: SupabaseClient = requireSupabase()) {
  if (assigned) {
    const { error } = await client.from('task_assignments').upsert({ workspace_id: workspaceId, task_id: taskId, profile_id: profileId }, { onConflict: 'task_id,profile_id' });
    if (error) throw error;
  } else {
    const { error } = await client.from('task_assignments').delete().eq('task_id', taskId).eq('profile_id', profileId);
    if (error) throw error;
  }
}


function cloudErrorText(value: unknown, fallback = 'Cloud request failed'): string {
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

async function throwFunctionError(error: unknown): Promise<never> {
  const candidate = error as { message?: string; context?: Response };
  let detail = cloudErrorText(error, 'Edge Function request failed');
  const response = candidate?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      detail = cloudErrorText(payload, detail);
    } catch {
      try {
        const text = await response.clone().text();
        if (text.trim()) detail = text.trim();
      } catch { /* retain original message */ }
    }
  }
  throw new Error(detail);
}

export async function performTaskAction(body: Record<string, unknown>, client: SupabaseClient = requireSupabase()) {
  const { data, error } = await client.functions.invoke('task-action', { body });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(cloudErrorText(data.error, 'Task action failed'));
  return data?.data;
}

async function completeTaskConfirmed(payload: Extract<CloudMutation, { type: 'complete_task' }>['payload'], client: SupabaseClient = requireSupabase()) {
  const procedure = payload.allowRepeatDaily ? 'complete_daily_task_again' : 'complete_task_direct';
  const { data, error } = await client.rpc(procedure, {
    p_event_id: payload.eventId,
    p_task_id: payload.taskId,
    p_profile_id: payload.profileId,
    p_occurred_at: payload.occurredAt,
    p_period_key: payload.periodKey,
    p_local_date: payload.localDate,
  });
  if (error) throw error;
  return data;
}

async function undoTaskConfirmed(payload: Extract<CloudMutation, { type: 'undo_task' }>['payload'], client: SupabaseClient = requireSupabase()) {
  const { data, error } = await client.rpc('undo_task_completion', {
    p_task_id: payload.taskId,
    p_profile_id: payload.profileId,
    p_completed_at: payload.occurredAt ?? null,
  });
  if (error) throw error;
  return data;
}

async function submitTaskRequestConfirmed(payload: Extract<CloudMutation, { type: 'request_task' }>['payload'], client: SupabaseClient = requireSupabase()) {
  const { data, error } = await client.rpc('submit_task_request', {
    p_request_id: payload.requestId,
    p_task_id: payload.taskId,
    p_profile_id: payload.profileId,
    p_requested_at: payload.requestedAt,
    p_period_key: payload.periodKey,
    p_local_date: payload.localDate,
  });
  if (error) throw error;

  // The database write is the source of truth. Push delivery is a best-effort
  // follow-up so a missing/cold Edge Function can never prevent a child from
  // submitting a completed task to their parent.
  void performTaskAction({ action: 'notify-request', requestId: payload.requestId }, client).catch(() => undefined);
  return data;
}

async function reviewTaskRequestConfirmed(payload: Extract<CloudMutation, { type: 'resolve_task' }>['payload'], client: SupabaseClient = requireSupabase()) {
  const status = payload.status === 'approved' ? 'approved' : 'denied';
  const { data, error } = await client.rpc('review_task_request', {
    p_request_id: payload.requestId,
    p_status: status,
    p_completion_id: payload.completionId,
  });
  if (error) throw error;
  void performTaskAction({ action: 'notify-review', requestId: payload.requestId, status }, client).catch(() => undefined);
  return data;
}

export async function insertReward(workspaceId: string, reward: ChildReward, client: SupabaseClient = requireSupabase()) {
  const icon = await prepareIconForCloud(workspaceId, 'rewards', reward.id, reward.icon, client);
  const { data: userData } = await client.auth.getUser();
  const { error } = await client.from('reward_templates').insert({
    id: reward.id,
    workspace_id: workspaceId,
    title: reward.title,
    cost: reward.cost,
    icon_type: icon.type,
    icon_value: icon.value,
    created_by: userData.user?.id ?? null,
    created_at: reward.createdAt,
  });
  if (error) throw error;
  if (reward.assignedProfileIds.length) {
    const { error: assignmentError } = await client.from('reward_assignments').insert(reward.assignedProfileIds.map((profileId) => ({
      workspace_id: workspaceId,
      reward_id: reward.id,
      profile_id: profileId,
    })));
    if (assignmentError) throw assignmentError;
  }
}

export async function updateReward(workspaceId: string, reward: ChildReward, client: SupabaseClient = requireSupabase()) {
  const icon = await prepareIconForCloud(workspaceId, 'rewards', reward.id, reward.icon, client);
  const { error } = await client.from('reward_templates').update({ title: reward.title, cost: reward.cost, icon_type: icon.type, icon_value: icon.value }).eq('id', reward.id);
  if (error) throw error;
  const { error: removeError } = await client.from('reward_assignments').delete().eq('reward_id', reward.id);
  if (removeError) throw removeError;
  if (reward.assignedProfileIds.length) {
    const { error: assignmentError } = await client.from('reward_assignments').insert(reward.assignedProfileIds.map((profileId) => ({ workspace_id: workspaceId, reward_id: reward.id, profile_id: profileId })));
    if (assignmentError) throw assignmentError;
  }
}

export async function removeReward(rewardId: string, client: SupabaseClient = requireSupabase()) {
  const { error } = await client.from('reward_templates').delete().eq('id', rewardId);
  if (error) throw error;
}

export async function setRewardAssignment(workspaceId: string, rewardId: string, profileId: string, assigned: boolean, client: SupabaseClient = requireSupabase()) {
  if (assigned) {
    const { error } = await client.from('reward_assignments').upsert({ workspace_id: workspaceId, reward_id: rewardId, profile_id: profileId }, { onConflict: 'reward_id,profile_id' });
    if (error) throw error;
  } else {
    const { error } = await client.from('reward_assignments').delete().eq('reward_id', rewardId).eq('profile_id', profileId);
    if (error) throw error;
  }
}

async function redeemRewardDirect(workspaceId: string, payload: Extract<CloudMutation, { type: 'redeem_reward' }>['payload'], client: SupabaseClient = requireSupabase()) {

  // Repair only what is actually missing. Do not overwrite an existing cloud
  // reward template just because the local snapshot is older.
  if (payload.reward) {
    const { data: existingReward, error: lookupError } = await client
      .from('reward_templates')
      .select('id')
      .eq('id', payload.rewardId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!existingReward) {
      const icon = await prepareIconForCloud(workspaceId, 'rewards', payload.reward.id, payload.reward.icon, client);
      const { data: userData } = await client.auth.getUser();
      const { error: insertError } = await client.from('reward_templates').insert({
        id: payload.reward.id,
        workspace_id: workspaceId,
        title: payload.reward.title.trim(),
        cost: Math.max(1, payload.reward.cost),
        icon_type: icon.type,
        icon_value: icon.value,
        created_by: userData.user?.id ?? null,
        created_at: payload.reward.createdAt,
      });
      if (insertError) throw insertError;
    }

    const { error: assignmentError } = await client.from('reward_assignments').upsert({
      workspace_id: workspaceId,
      reward_id: payload.rewardId,
      profile_id: payload.profileId,
    }, { onConflict: 'reward_id,profile_id' });
    if (assignmentError) throw assignmentError;
  }

  const rpcArgs = {
    p_redemption_id: payload.redemptionId,
    p_delivery_id: payload.deliveryId,
    p_reward_id: payload.rewardId,
    p_profile_id: payload.profileId,
    p_deliver_to_child: payload.deliverToChild,
    p_redeemed_at: payload.redeemedAt,
    p_allow_early: payload.allowEarly === true,
  };

  let { data, error } = await client.rpc('redeem_reward', rpcArgs);

  // Backward compatibility for a database that has not yet received the
  // 7-argument allowEarly migration. Normal redemptions can safely use the
  // original 6-argument RPC until db push is completed.
  if (error && payload.allowEarly !== true && /function .*redeem_reward|schema cache|p_allow_early/i.test(cloudErrorText(error, ''))) {
    ({ data, error } = await client.rpc('redeem_reward', {
      p_redemption_id: payload.redemptionId,
      p_delivery_id: payload.deliveryId,
      p_reward_id: payload.rewardId,
      p_profile_id: payload.profileId,
      p_deliver_to_child: payload.deliverToChild,
      p_redeemed_at: payload.redeemedAt,
    }));
  }

  // A stale balance never authorizes early redemption. Preserve the adult's
  // original choice; a conflict goes to review instead of silently spending less.

  if (error) throw error;

  // Notification is deliberately non-blocking. The reward delivery row has
  // already been committed by the RPC, so a push-service problem cannot turn
  // a successful redemption into a Failed Sync Change.
  if (payload.deliverToChild) {
    void performRewardAction({
      action: 'notify',
      deliveryId: payload.deliveryId,
      profileId: payload.profileId,
    }, client).catch(() => undefined);
  }

  return data;
}

export async function performRewardAction(body: Record<string, unknown>, client: SupabaseClient = requireSupabase()) {
  const { data, error } = await client.functions.invoke('reward-action', { body });
  if (error) await throwFunctionError(error);
  if (data?.error) throw new Error(cloudErrorText(data.error, 'Reward action failed'));
  return data?.data;
}

export type CloudMutation =
  | { id: string; type: 'add_profile'; payload: { profile: ChildProfile } }
  | { id: string; type: 'update_profile'; payload: { profile: ChildProfile } }
  | { id: string; type: 'update_child_preferences'; payload: { profile: ChildProfile } }
  | { id: string; type: 'delete_profile'; payload: { profileId: string } }
  | { id: string; type: 'add_task'; payload: { task: ChildTask } }
  | { id: string; type: 'update_task'; payload: { task: ChildTask } }
  | { id: string; type: 'delete_task'; payload: { taskId: string } }
  | { id: string; type: 'set_task_assignment'; payload: { taskId: string; profileId: string; assigned: boolean } }
  | { id: string; type: 'complete_task'; payload: { eventId: string; taskId: string; profileId: string; occurredAt: string; periodKey: string; localDate: string; allowRepeatDaily?: boolean } }
  | { id: string; type: 'undo_task'; payload: { taskId: string; profileId: string; occurredAt?: string } }
  | { id: string; type: 'request_task'; payload: { requestId: string; taskId: string; profileId: string; requestedAt: string; periodKey: string; localDate: string } }
  | { id: string; type: 'resolve_task'; payload: { requestId: string; status: Exclude<TaskCompletionRequestStatus, 'pending'>; completionId: string } }
  | { id: string; type: 'add_reward'; payload: { reward: ChildReward } }
  | { id: string; type: 'update_reward'; payload: { reward: ChildReward } }
  | { id: string; type: 'delete_reward'; payload: { rewardId: string } }
  | { id: string; type: 'set_reward_assignment'; payload: { rewardId: string; profileId: string; assigned: boolean } }
  | { id: string; type: 'redeem_reward'; payload: { redemptionId: string; deliveryId: string; rewardId: string; profileId: string; deliverToChild: boolean; redeemedAt: string; allowEarly?: boolean; reward?: ChildReward } }
  | { id: string; type: 'open_delivery'; payload: { deliveryId: string } };

export async function executeCloudMutation(workspaceId: string, mutation: CloudMutation, client: SupabaseClient = requireSupabase()) {
  try {
    switch (mutation.type) {
    case 'add_profile': return insertProfile(workspaceId, mutation.payload.profile, client);
    case 'update_profile': return updateProfile(workspaceId, mutation.payload.profile, client);
    case 'update_child_preferences': return updateChildProfilePreferences(mutation.payload.profile, client);
    case 'delete_profile': return removeProfile(mutation.payload.profileId, client);
    case 'add_task': return insertTask(workspaceId, mutation.payload.task, client);
    case 'update_task': return updateTask(workspaceId, mutation.payload.task, client);
    case 'delete_task': return removeTask(mutation.payload.taskId, client);
    case 'set_task_assignment': return setTaskAssignment(workspaceId, mutation.payload.taskId, mutation.payload.profileId, mutation.payload.assigned, client);
    // Direct manager completions do not need push delivery. Calling the
    // authenticated RPC directly avoids an Edge Function cold start before
    // the celebration can be shown.
    case 'complete_task': return completeTaskConfirmed(mutation.payload, client);
    case 'undo_task': return undoTaskConfirmed(mutation.payload, client);
    case 'request_task': return submitTaskRequestConfirmed(mutation.payload, client);
    case 'resolve_task': return reviewTaskRequestConfirmed(mutation.payload, client);
    case 'add_reward': return insertReward(workspaceId, mutation.payload.reward, client);
    case 'update_reward': return updateReward(workspaceId, mutation.payload.reward, client);
    case 'delete_reward': return removeReward(mutation.payload.rewardId, client);
    case 'set_reward_assignment': return setRewardAssignment(workspaceId, mutation.payload.rewardId, mutation.payload.profileId, mutation.payload.assigned, client);
    case 'redeem_reward':
      return redeemRewardDirect(workspaceId, mutation.payload, client);
    case 'open_delivery': return performRewardAction({ action: 'open', deliveryId: mutation.payload.deliveryId }, client);
    }
  } catch (error) {
    const detail = cloudErrorText(error, 'Cloud request failed');
    throw new Error(`${mutation.type}: ${detail}`);
  }
}

export function emptyFamilyState() {
  return createInitialFamilyState();
}

export function newCloudId(prefix: string) {
  return makeId(prefix);
}
