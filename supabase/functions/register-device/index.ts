import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { client, user } = await requireUser(req);
    const body = await req.json();
    const action = String(body.action ?? 'register');
    const token = String(body.expoPushToken ?? '');
    if (!token) throw new Error('Push token required');
    const admin = serviceClient();

    if (action === 'unregister') {
      const { error } = await admin.from('device_tokens').delete().eq('user_id', user.id).eq('expo_push_token', token);
      if (error) throw error;
      return jsonResponse({ data: { registered: false } });
    }

    const workspaceId = String(body.workspaceId ?? '');
    const { data: membership, error: membershipError } = await client
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error('Workspace membership required');

    const { error } = await admin.from('device_tokens').upsert({
      user_id: user.id,
      workspace_id: workspaceId,
      expo_push_token: token,
      platform: body.platform ?? null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'expo_push_token' });
    if (error) throw error;
    return jsonResponse({ data: { registered: true } });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
