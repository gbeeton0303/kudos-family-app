import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/push.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { client, user } = await requireUser(req);
    const body = await req.json();
    const action = String(body.action ?? '');

    if (action === 'redeem') {
      const redeem = () => client.rpc('redeem_reward', {
        p_redemption_id: body.redemptionId,
        p_delivery_id: body.deliveryId,
        p_reward_id: body.rewardId,
        p_profile_id: body.profileId,
        p_deliver_to_child: body.deliverToChild !== false,
        p_redeemed_at: body.redeemedAt,
        p_allow_early: body.allowEarly === true,
      });

      let { data, error } = await redeem();

      // Legacy/suggested rewards can exist locally while their cloud assignment
      // (or, rarely, template) is stale. Repair only after verifying the caller
      // manages the same workspace, then retry the atomic redemption once.
      if (error && body.reward && body.workspaceId) {
        const admin = serviceClient();
        const { data: membership } = await admin
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', body.workspaceId)
          .eq('user_id', user.id)
          .in('role', ['parent', 'teacher'])
          .maybeSingle();

        if (membership) {
          const reward = body.reward as Record<string, unknown>;
          const icon = reward.icon as Record<string, unknown> | undefined;
          const iconType = icon?.type === 'photo' ? 'photo' : 'preset';
          const iconValue = iconType === 'preset'
            ? String(icon?.value ?? '🎁')
            : String(icon?.uri ?? '🎁');

          await admin.from('reward_templates').upsert({
            id: body.rewardId,
            workspace_id: body.workspaceId,
            title: String(reward.title ?? 'Reward').trim(),
            cost: Math.max(1, Number(reward.cost ?? 1)),
            icon_type: iconType,
            icon_value: iconValue,
            created_by: user.id,
            created_at: String(reward.createdAt ?? new Date().toISOString()),
          }, { onConflict: 'id' });

          await admin.from('reward_assignments').upsert({
            workspace_id: body.workspaceId,
            reward_id: body.rewardId,
            profile_id: body.profileId,
          }, { onConflict: 'reward_id,profile_id' });

          ({ data, error } = await redeem());
        }
      }

      if (error) throw error;
      if (body.deliverToChild !== false) {
        const admin = serviceClient();
        const { data: profile } = await admin.from('child_profiles').select('linked_user_id, name').eq('id', body.profileId).maybeSingle();
        if (profile?.linked_user_id) {
          const { data: tokens } = await admin.from('device_tokens').select('expo_push_token').eq('user_id', profile.linked_user_id);
          await sendExpoPush((tokens ?? []).map((row) => ({
            to: row.expo_push_token,
            title: 'You earned a reward! 🎁',
            body: 'Open Kudos to reveal and redeem your reward.',
            sound: 'default',
            data: { type: 'reward_delivery', deliveryId: body.deliveryId, profileId: body.profileId },
          }))).catch((pushError) => console.error('Push delivery failed', pushError));
        }
      }
      return jsonResponse({ data });
    }


    if (action === 'notify') {
      const admin = serviceClient();
      const { data: profile } = await admin.from('child_profiles').select('linked_user_id, name').eq('id', body.profileId).maybeSingle();
      if (profile?.linked_user_id) {
        const { data: tokens } = await admin.from('device_tokens').select('expo_push_token').eq('user_id', profile.linked_user_id);
        await sendExpoPush((tokens ?? []).map((row) => ({
          to: row.expo_push_token,
          title: 'You earned a reward! 🎁',
          body: 'Open Kudos to reveal your reward.',
          sound: 'default',
          data: { type: 'reward_delivery', deliveryId: body.deliveryId, profileId: body.profileId },
        }))).catch((pushError) => console.error('Push delivery failed', pushError));
      }
      return jsonResponse({ data: { notified: true } });
    }

    if (action === 'open') {
      const { data, error } = await client.rpc('open_reward_delivery', { p_delivery_id: body.deliveryId });
      if (error) throw error;
      const admin = serviceClient();
      const { data: delivery } = await admin.from('reward_deliveries').select('workspace_id, reward_title, profile_id').eq('id', body.deliveryId).maybeSingle();
      if (delivery?.workspace_id) {
        const { data: profile } = await admin.from('child_profiles').select('name').eq('id', delivery.profile_id).maybeSingle();
        const { data: managers } = await admin.from('workspace_members').select('user_id').eq('workspace_id', delivery.workspace_id).in('role', ['parent', 'teacher']);
        const managerIds = (managers ?? []).map((row) => row.user_id);
        const { data: tokens } = managerIds.length ? await admin.from('device_tokens').select('expo_push_token').in('user_id', managerIds) : { data: [] };
        await sendExpoPush((tokens ?? []).map((row) => ({
          to: row.expo_push_token,
          title: 'Reward redeemed! 🎉',
          body: `${profile?.name ?? 'A child'} opened “${delivery.reward_title}”.`,
          sound: 'default',
          data: { type: 'reward_opened', deliveryId: body.deliveryId, profileId: delivery.profile_id },
        }))).catch((pushError) => console.error('Push delivery failed', pushError));
      }
      return jsonResponse({ data });
    }

    return jsonResponse({ error: 'Unknown reward action' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
