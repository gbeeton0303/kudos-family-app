import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authorizeRewardDelivery, repairWorkspaceReward, requiredId } from '../_shared/workspace-security.ts';

export function createRewardHandler(deps: {
  requireUser: (req: Request) => Promise<any>;
  serviceClient: () => any;
  sendExpoPush: (messages: any[]) => Promise<unknown>;
}) {
  const { requireUser, serviceClient, sendExpoPush } = deps;
  return async (req: Request) => {
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
      if (error && body.reward && body.workspaceId && /Reward (?:not found|not assigned)/i.test(error.message ?? '')) {
        const admin = serviceClient();
        await repairWorkspaceReward(admin, user.id, body);
        ({ data, error } = await redeem());
      }

      if (error) throw error;
      if (body.deliverToChild !== false) {
        try {
        const admin = serviceClient();
        const { profile, delivery } = await authorizeRewardDelivery(admin, user.id,
          requiredId(body.deliveryId, 'delivery ID'), requiredId(body.profileId, 'profile ID'));
        if (profile?.linked_user_id) {
          const { data: tokens } = await admin.from('device_tokens').select('expo_push_token')
            .eq('user_id', profile.linked_user_id).eq('workspace_id', delivery.workspace_id);
          await sendExpoPush((tokens ?? []).map((row: { expo_push_token: string }) => ({
            to: row.expo_push_token,
            title: 'You earned a reward! 🎁',
            body: 'Open Kudos to reveal and redeem your reward.',
            sound: 'default',
            data: { type: 'reward_delivery', deliveryId: body.deliveryId, profileId: body.profileId },
          }))).catch((pushError) => console.error('Push delivery failed', pushError));
        }
        } catch (pushError) {
          // The RPC has committed. Failed notification authorization or token
          // lookup must not turn that redemption into a failed sync mutation.
          console.error('Reward notification skipped', pushError);
        }
      }
      return jsonResponse({ data });
    }


    if (action === 'notify') {
      const admin = serviceClient();
      const { profile, delivery } = await authorizeRewardDelivery(admin, user.id,
        requiredId(body.deliveryId, 'delivery ID'), requiredId(body.profileId, 'profile ID'));
      if (profile?.linked_user_id) {
        const { data: tokens, error: tokenError } = await admin.from('device_tokens').select('expo_push_token')
          .eq('user_id', profile.linked_user_id).eq('workspace_id', delivery.workspace_id);
        if (tokenError) throw tokenError;
        await sendExpoPush((tokens ?? []).map((row: { expo_push_token: string }) => ({
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
        const managerIds = (managers ?? []).map((row: { user_id: string }) => row.user_id);
        const { data: tokens } = managerIds.length ? await admin.from('device_tokens').select('expo_push_token').in('user_id', managerIds) : { data: [] };
        await sendExpoPush((tokens ?? []).map((row: { expo_push_token: string }) => ({
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
};
}
