import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireManager, requiredId } from '../_shared/workspace-security.ts';
import { importId, remapImportState, writeImportPlan } from '../_shared/import-security.ts';
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
    const { data: imported, error: importedError } = await admin.from('migration_imports')
      .select('workspace_id').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
    if (importedError) throw importedError;
    // Honor old import markers too, avoiding duplicate history after upgrading.
    if (imported) return jsonResponse({ data: { imported: true, alreadyImported: true } });
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
      }], conflict: 'id' });
      if (task.assignedProfileIds?.length) {
        writes.push({ table: 'task_assignments',
          rows: task.assignedProfileIds.map((profileId: string) => ({ workspace_id: workspaceId, task_id: task.id, profile_id: profileId })),
          conflict: 'task_id,profile_id' });
      }
      for (const [profileId, events] of Object.entries(task.completionEvents ?? {})) {
        for (const event of events as string[]) {
          const eventId = await importId(workspaceId, 'completion', [task.id, profileId, event]);
          const periodKey = task.frequency === 'unlimited'
            ? `event-${event}`
            : task.frequency === 'weekly'
              ? `week-${event.slice(0, 10)}-weekday-${new Date(event).getUTCDay()}`
              : `day-${event.slice(0, 10)}`;
          writes.push({ table: 'task_completions', rows: [{
            id: eventId,
            workspace_id: workspaceId,
            task_id: task.id,
            profile_id: profileId,
            completed_at: event,
            period_key: periodKey,
            source: 'migration',
            approved_by: user.id,
          }], conflict: 'id' });
          writes.push({ table: 'currency_ledger', rows: [{
            id: `ledger-${eventId}`,
            workspace_id: workspaceId,
            profile_id: profileId,
            amount: task.amount,
            transaction_type: 'migration',
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
        for (const event of events as string[]) {
          const redemptionId = await importId(workspaceId, 'redemption', [reward.id, profileId, event]);
          writes.push({ table: 'reward_redemptions', rows: [{
            id: redemptionId,
            workspace_id: workspaceId,
            reward_id: reward.id,
            profile_id: profileId,
            cost: reward.cost,
            redeemed_by: user.id,
            redeemed_at: event,
          }], conflict: 'id' });
          writes.push({ table: 'currency_ledger', rows: [{
            id: `ledger-${redemptionId}`,
            workspace_id: workspaceId,
            profile_id: profileId,
            amount: -reward.cost,
            transaction_type: 'migration',
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
    await writeImportPlan(admin, workspaceId, writes);
    const { error: markerError } = await admin.from('migration_imports').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      source_version: body.sourceVersion ?? 'local',
    }, { onConflict: 'workspace_id,user_id', ignoreDuplicates: true });
    if (markerError) throw markerError;
    return jsonResponse({ data: { imported: true } });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
};
}
