import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireManager, requiredId } from '../_shared/workspace-security.ts';
import { importId, remapImportState } from '../_shared/import-security.ts';
import type { ImportWrite } from '../_shared/import-security.ts';

export function createMigrationHandler(deps: { requireUser: (req: Request) => Promise<any>; serviceClient: () => any }) {
  return async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { user } = await deps.requireUser(req);
    const body = await req.json();
    const workspaceId = requiredId(body.workspaceId, 'workspace ID').toLowerCase();
    const admin = deps.serviceClient();
    await requireManager(admin, user.id, workspaceId);
    const state = await remapImportState(workspaceId, body.state);
    const writes: ImportWrite[] = [];
    const profileRows = state.profiles.map((p: any) => ({
      id: p.id,
      workspace_id: workspaceId,
      name: p.name,
      avatar_type: p.avatar.type,
      avatar_value: p.avatar.type === 'preset' ? p.avatar.key : p.avatar.uri,
      color_key: p.colorKey,
      pattern: p.pattern ?? 'solid',
      currency_type: p.currencyType,
      storage_type: p.storageType,
      starting_balance: p.startingBalance ?? 0,
      created_at: p.createdAt,
    }));
    if (profileRows.length) {
      writes.push({ table: 'child_profiles', rows: profileRows, conflict: 'id' });
    }
    for (const profile of state.profiles) {
      for (const resetAt of profile.balanceResetEvents) {
        writes.push({ table: 'profile_balance_resets', rows: [{
          id: await importId(workspaceId, 'balance-reset', [profile.id, resetAt]),
          workspace_id: workspaceId, profile_id: profile.id, reset_at: resetAt,
          source_id: null, created_by: user.id,
        }], conflict: 'id' });
      }
    }

    for (const task of state.tasks) {
      writes.push({ table: 'task_templates', rows: [{
        id: task.id,
        workspace_id: workspaceId,
        title: task.title,
        amount: task.amount,
        frequency: task.frequency,
        description: task.description ?? null,
        icon_type: task.icon.type,
        icon_value: task.icon.type === 'preset' ? task.icon.value : task.icon.uri,
        schedule_days: task.scheduleDays ?? null,
        schedule_dates: task.scheduleDates ?? null,
        created_by: user.id,
        created_at: task.createdAt,
        archived_at: task.archivedAt ?? null,
      }], conflict: 'id' });
      if (task.assignedProfileIds?.length) {
        writes.push({ table: 'task_assignments',
          rows: task.assignedProfileIds.map((profileId: string) => ({ workspace_id: workspaceId, task_id: task.id, profile_id: profileId })),
          conflict: 'task_id,profile_id' });
      }
      for (const [profileId, events] of Object.entries(task.completionEvents ?? {})) {
        const seenPeriods = new Set<string>();
        for (const [index, event] of (events as string[]).entries()) {
          const duplicateIndex = (events as string[]).slice(0, index).filter((value) => value === event).length;
          const eventId = await importId(workspaceId, 'completion', duplicateIndex ? [task.id, profileId, event, duplicateIndex] : [task.id, profileId, event]);
          const historicalAmount = task.completionAmounts[profileId][index];
          const eventDate = new Date(event);
          const monday = new Date(eventDate);
          monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
          const periodKey = task.frequency === 'unlimited'
            ? `event-${event}`
            : task.frequency === 'weekly'
              ? `week-${monday.toISOString().slice(0, 10)}`
              : task.frequency === 'monthly' ? `month-${event.slice(0, 7)}` : `day-${event.slice(0, 10)}`;
          const storedPeriod = seenPeriods.has(periodKey) ? `${periodKey}:import:${eventId}` : periodKey;
          seenPeriods.add(periodKey);
          writes.push({ table: 'task_completions', rows: [{
            id: eventId,
            workspace_id: workspaceId,
            task_id: task.id,
            profile_id: profileId,
            completed_at: event,
            period_key: storedPeriod,
            source: 'migration',
            approved_by: user.id,
          }], conflict: 'id' });
          writes.push({ table: 'currency_ledger', rows: [{
            id: `ledger-${eventId}`,
            workspace_id: workspaceId,
            profile_id: profileId,
            amount: historicalAmount,
            transaction_type: 'task_completion',
            source_id: eventId,
            description: task.title,
            created_by: user.id,
            created_at: event,
          }], conflict: 'id' });
        }
      }
    }

    for (const reward of state.rewards) {
      writes.push({ table: 'reward_templates', rows: [{
        id: reward.id,
        workspace_id: workspaceId,
        title: reward.title,
        cost: reward.cost,
        icon_type: reward.icon.type,
        icon_value: reward.icon.type === 'preset' ? reward.icon.value : reward.icon.uri,
        created_by: user.id,
        created_at: reward.createdAt,
      }], conflict: 'id' });
      if (reward.assignedProfileIds?.length) {
        writes.push({ table: 'reward_assignments',
          rows: reward.assignedProfileIds.map((profileId: string) => ({ workspace_id: workspaceId, reward_id: reward.id, profile_id: profileId })),
          conflict: 'reward_id,profile_id' });
      }
      for (const [profileId, events] of Object.entries(reward.redemptionEvents ?? {})) {
        for (const [index, event] of (events as string[]).entries()) {
          const duplicateIndex = (events as string[]).slice(0, index).filter((value) => value === event).length;
          const redemptionId = await importId(workspaceId, 'redemption', duplicateIndex ? [reward.id, profileId, event, duplicateIndex] : [reward.id, profileId, event]);
          const historicalCost = reward.redemptionCosts[profileId][index];
          writes.push({ table: 'reward_redemptions', rows: [{
            id: redemptionId,
            workspace_id: workspaceId,
            reward_id: reward.id,
            profile_id: profileId,
            cost: historicalCost,
            redeemed_by: user.id,
            redeemed_at: reward.redemptionAccountingEvents[profileId]?.[index] ?? event,
            occurred_at: event,
          }], conflict: 'id' });
          writes.push({ table: 'currency_ledger', rows: [{
            id: `ledger-${redemptionId}`,
            workspace_id: workspaceId,
            profile_id: profileId,
            amount: -historicalCost,
            transaction_type: 'reward_redemption',
            source_id: redemptionId,
            description: reward.title,
            created_by: user.id,
            created_at: event,
          }], conflict: 'id' });
        }
      }
    }

    if (state.completionRequests?.length) {
      writes.push({ table: 'task_completion_requests', rows: state.completionRequests.map((r: any) => ({
          id: r.id,
          workspace_id: workspaceId,
          task_id: r.taskId,
          profile_id: r.profileId,
          requested_by: user.id,
          requested_at: r.requestedAt,
          period_key: `day-${r.requestedAt.slice(0, 10)}`,
          status: r.status,
          reviewed_at: r.reviewedAt ?? null,
        })), conflict: 'id' });
    }
    if (state.rewardDeliveries?.length) {
      writes.push({ table: 'reward_deliveries', rows: state.rewardDeliveries.map((d: any) => ({
          id: d.id,
          workspace_id: workspaceId,
          reward_id: d.rewardId,
          profile_id: d.profileId,
          reward_title: d.rewardTitle,
          reward_icon_type: d.rewardIcon.type,
          reward_icon_value: d.rewardIcon.type === 'preset' ? d.rewardIcon.value : d.rewardIcon.uri,
          cost: d.cost,
          balance_before: d.balanceBefore,
          balance_after: d.balanceAfter,
          sent_at: d.sentAt,
          status: d.status,
          opened_at: d.openedAt ?? null,
        })), conflict: 'id' });
    }
    // One database call commits the complete plan and receipt, or nothing.
    // Never fall back to sequential writes if the migration is missing.
    const payloadHash = await importId(workspaceId, 'payload', writes);
    const { data, error } = await admin.rpc('commit_local_import', {
      p_workspace_id: workspaceId, p_user_id: user.id, p_writes: writes,
      p_payload_hash: payloadHash, p_source_version: body.sourceVersion ?? 'local',
    });
    if (error) throw error;
    return jsonResponse({ data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
};
}
