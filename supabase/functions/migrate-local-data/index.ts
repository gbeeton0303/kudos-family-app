import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { client, user } = await requireUser(req);
    const body = await req.json();
    const workspaceId = String(body.workspaceId);
    const state = body.state;
    const { data: membership } = await client
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership || !['parent', 'teacher'].includes(membership.role)) throw new Error('Manager access required');
    if (!state || !Array.isArray(state.profiles) || !Array.isArray(state.tasks) || !Array.isArray(state.rewards)) {
      throw new Error('Invalid migration payload');
    }

    const admin = serviceClient();
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
      const { error } = await admin.from('child_profiles').upsert(profileRows, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const task of state.tasks) {
      const { error: taskError } = await admin.from('task_templates').upsert({
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
      }, { onConflict: 'id' });
      if (taskError) throw taskError;
      if (task.assignedProfileIds?.length) {
        const { error } = await admin.from('task_assignments').upsert(
          task.assignedProfileIds.map((profileId: string) => ({ workspace_id: workspaceId, task_id: task.id, profile_id: profileId })),
          { onConflict: 'task_id,profile_id' },
        );
        if (error) throw error;
      }
      for (const [profileId, events] of Object.entries(task.completionEvents ?? {})) {
        for (const event of events as string[]) {
          const eventId = `migration-task-${task.id}-${profileId}-${event}`.replace(/[^a-zA-Z0-9-]/g, '-');
          const periodKey = task.frequency === 'unlimited'
            ? `event-${event}`
            : task.frequency === 'weekly'
              ? `week-${event.slice(0, 10)}-weekday-${new Date(event).getUTCDay()}`
              : `day-${event.slice(0, 10)}`;
          const { error: completionError } = await admin.from('task_completions').upsert({
            id: eventId,
            workspace_id: workspaceId,
            task_id: task.id,
            profile_id: profileId,
            completed_at: event,
            period_key: periodKey,
            source: 'migration',
            approved_by: user.id,
          }, { onConflict: 'id' });
          if (completionError) throw completionError;
          const { error: ledgerError } = await admin.from('currency_ledger').upsert({
            id: `ledger-${eventId}`,
            workspace_id: workspaceId,
            profile_id: profileId,
            amount: task.amount,
            transaction_type: 'migration',
            source_id: eventId,
            description: task.title,
            created_by: user.id,
            created_at: event,
          }, { onConflict: 'id' });
          if (ledgerError) throw ledgerError;
        }
      }
    }

    for (const reward of state.rewards) {
      const { error: rewardError } = await admin.from('reward_templates').upsert({
        id: reward.id,
        workspace_id: workspaceId,
        title: reward.title,
        cost: reward.cost,
        icon_type: reward.icon.type,
        icon_value: reward.icon.type === 'preset' ? reward.icon.value : reward.icon.uri,
        created_by: user.id,
        created_at: reward.createdAt,
      }, { onConflict: 'id' });
      if (rewardError) throw rewardError;
      if (reward.assignedProfileIds?.length) {
        const { error } = await admin.from('reward_assignments').upsert(
          reward.assignedProfileIds.map((profileId: string) => ({ workspace_id: workspaceId, reward_id: reward.id, profile_id: profileId })),
          { onConflict: 'reward_id,profile_id' },
        );
        if (error) throw error;
      }
      for (const [profileId, events] of Object.entries(reward.redemptionEvents ?? {})) {
        for (const event of events as string[]) {
          const redemptionId = `migration-reward-${reward.id}-${profileId}-${event}`.replace(/[^a-zA-Z0-9-]/g, '-');
          const { error: redemptionError } = await admin.from('reward_redemptions').upsert({
            id: redemptionId,
            workspace_id: workspaceId,
            reward_id: reward.id,
            profile_id: profileId,
            cost: reward.cost,
            redeemed_by: user.id,
            redeemed_at: event,
          }, { onConflict: 'id' });
          if (redemptionError) throw redemptionError;
          const { error: ledgerError } = await admin.from('currency_ledger').upsert({
            id: `ledger-${redemptionId}`,
            workspace_id: workspaceId,
            profile_id: profileId,
            amount: -reward.cost,
            transaction_type: 'migration',
            source_id: redemptionId,
            description: reward.title,
            created_by: user.id,
            created_at: event,
          }, { onConflict: 'id' });
          if (ledgerError) throw ledgerError;
        }
      }
    }

    if (state.completionRequests?.length) {
      const { error } = await admin.from('task_completion_requests').upsert(
        state.completionRequests.map((r: any) => ({
          id: r.id,
          workspace_id: workspaceId,
          task_id: r.taskId,
          profile_id: r.profileId,
          requested_by: user.id,
          requested_at: r.requestedAt,
          period_key: `day-${r.requestedAt.slice(0, 10)}`,
          status: r.status,
          reviewed_at: r.reviewedAt ?? null,
        })),
        { onConflict: 'id' },
      );
      if (error) throw error;
    }
    if (state.rewardDeliveries?.length) {
      const { error } = await admin.from('reward_deliveries').upsert(
        state.rewardDeliveries.map((d: any) => ({
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
        })),
        { onConflict: 'id' },
      );
      if (error) throw error;
    }
    const { error: markerError } = await admin.from('migration_imports').upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      source_version: body.sourceVersion ?? 'local',
    }, { onConflict: 'workspace_id,user_id' });
    if (markerError) throw markerError;
    return jsonResponse({ data: { imported: true } });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
