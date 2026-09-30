import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/push.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

async function notifyManagers(admin: ReturnType<typeof serviceClient>, requestId: string) {
  const { data: requestRow, error: requestError } = await admin
    .from('task_completion_requests')
    .select('workspace_id')
    .eq('id', requestId)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!requestRow) throw new Error('Task request not found');
  const workspaceId = String(requestRow.workspace_id);
  const { data: managers, error: managerError } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .in('role', ['parent', 'teacher']);
  if (managerError) throw managerError;
  const managerIds = (managers ?? []).map((row) => row.user_id);
  const { data: tokens } = managerIds.length
    ? await admin.from('device_tokens').select('expo_push_token').in('user_id', managerIds)
    : { data: [] };
  await sendExpoPush((tokens ?? []).map((row) => ({
    to: row.expo_push_token,
    title: 'Task ready for review',
    body: 'A task completion is waiting for your approval.',
    sound: 'default',
    data: { type: 'task_request', requestId, workspaceId },
  }))).catch((pushError) => console.error('Push delivery failed', pushError));
  return { notified: true, workspace_id: workspaceId };
}

async function notifyChild(admin: ReturnType<typeof serviceClient>, requestId: string, status: 'approved' | 'denied') {
  const { data: requestRow, error: requestError } = await admin
    .from('task_completion_requests')
    .select('profile_id,workspace_id')
    .eq('id', requestId)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!requestRow) throw new Error('Task request not found');
  const { data: profileRow } = await admin.from('child_profiles').select('linked_user_id').eq('id', requestRow.profile_id).maybeSingle();
  const linkedUserId = profileRow?.linked_user_id;
  if (linkedUserId) {
    const { data: tokens } = await admin.from('device_tokens').select('expo_push_token').eq('user_id', linkedUserId);
    await sendExpoPush((tokens ?? []).map((row) => ({
      to: row.expo_push_token,
      title: status === 'approved' ? 'Task approved! 🎉' : 'Task needs another try',
      body: status === 'approved' ? 'Your points have been added.' : 'Your teacher or parent did not approve this completion.',
      sound: 'default',
      data: { type: 'task_review', requestId, status },
    }))).catch((pushError) => console.error('Push delivery failed', pushError));
  }
  return { notified: true, workspace_id: requestRow.workspace_id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { client, user } = await requireUser(req);
    const body = await req.json();
    const action = String(body.action ?? '');
    let result: Record<string, unknown> | null = null;

    if (action === 'complete') {
      const { data, error } = await client.rpc('complete_task_direct', {
        p_event_id: body.eventId,
        p_task_id: body.taskId,
        p_profile_id: body.profileId,
        p_occurred_at: body.occurredAt,
        p_period_key: body.periodKey ?? null,
        p_local_date: body.localDate ?? null,
      });
      if (error) throw error;
      result = data;
    } else if (action === 'undo') {
      const { data, error } = await client.rpc('undo_task_completion', {
        p_task_id: body.taskId,
        p_profile_id: body.profileId,
        p_completed_at: body.occurredAt ?? null,
      });
      if (error) throw error;
      result = data;
    } else if (action === 'request') {
      const { data, error } = await client.rpc('submit_task_request', {
        p_request_id: body.requestId,
        p_task_id: body.taskId,
        p_profile_id: body.profileId,
        p_requested_at: body.requestedAt,
        p_period_key: body.periodKey ?? null,
        p_local_date: body.localDate ?? null,
      });
      if (error) throw error;
      result = data;
      const admin = serviceClient();
      await notifyManagers(admin, String(body.requestId));
    } else if (action === 'approve' || action === 'deny') {
      const { data, error } = await client.rpc('review_task_request', {
        p_request_id: body.requestId,
        p_status: action === 'approve' ? 'approved' : 'denied',
        p_completion_id: body.completionId ?? null,
      });
      if (error) throw error;
      result = data;
      const admin = serviceClient();
      await notifyChild(admin, String(body.requestId), action === 'approve' ? 'approved' : 'denied');
    } else if (action === 'notify-request') {
      const admin = serviceClient();
      const requestId = String(body.requestId ?? '');
      const { data: requestRow, error: requestError } = await admin.from('task_completion_requests').select('requested_by').eq('id', requestId).maybeSingle();
      if (requestError) throw requestError;
      if (!requestRow || requestRow.requested_by !== user.id) throw new Error('Not authorized to notify for this task request');
      result = await notifyManagers(admin, requestId);
    } else if (action === 'notify-review') {
      const admin = serviceClient();
      const requestId = String(body.requestId ?? '');
      const status = body.status === 'approved' ? 'approved' : 'denied';
      const { data: requestRow, error: requestError } = await admin.from('task_completion_requests').select('workspace_id').eq('id', requestId).maybeSingle();
      if (requestError) throw requestError;
      if (!requestRow) throw new Error('Task request not found');
      const { data: membership, error: membershipError } = await admin.from('workspace_members').select('role').eq('workspace_id', requestRow.workspace_id).eq('user_id', user.id).maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership || !['parent', 'teacher'].includes(membership.role)) throw new Error('Not authorized to notify for this task review');
      result = await notifyChild(admin, requestId, status);
    } else {
      return jsonResponse({ error: 'Unknown task action' }, 400);
    }

    return jsonResponse({ data: result });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
