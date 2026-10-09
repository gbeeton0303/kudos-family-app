// These helpers accept the small query interface used by supabase-js so the
// authorization paths can also be executed in the Node regression tests.
export async function requireManager(client: any, userId: string, workspaceId: string) {
  const { data, error } = await client.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data || !['parent', 'teacher'].includes(data.role)) throw new Error('Manager access required');
}

export function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export async function requireWorkspaceProfile(client: any, profileId: string, workspaceId: string) {
  const { data, error } = await client.from('child_profiles').select('*').eq('id', profileId).maybeSingle();
  if (error) throw error;
  if (!data || data.workspace_id !== workspaceId) throw new Error('Profile does not belong to this workspace');
  return data;
}

export async function authorizeRewardDelivery(client: any, userId: string, deliveryId: string, profileId: string) {
  const { data: delivery, error } = await client.from('reward_deliveries').select('*')
    .eq('id', deliveryId).maybeSingle();
  if (error) throw error;
  if (!delivery || delivery.profile_id !== profileId) throw new Error('Reward delivery not found');
  await requireManager(client, userId, delivery.workspace_id);
  const profile = await requireWorkspaceProfile(client, profileId, delivery.workspace_id);
  return { delivery, profile };
}

export async function repairWorkspaceReward(client: any, userId: string, body: any) {
  const workspaceId = requiredId(body.workspaceId, 'workspace ID').toLowerCase();
  const rewardId = requiredId(body.rewardId, 'reward ID');
  const profileId = requiredId(body.profileId, 'profile ID');
  await requireManager(client, userId, workspaceId);
  await requireWorkspaceProfile(client, profileId, workspaceId);

  const readReward = async () => {
    const { data, error } = await client.from('reward_templates').select('*').eq('id', rewardId).maybeSingle();
    if (error) throw error;
    if (data && data.workspace_id !== workspaceId) throw new Error('Reward does not belong to this workspace');
    return data;
  };
  let reward = await readReward();
  if (!reward) {
    const candidate = body.reward;
    if (!candidate || (candidate.id != null && candidate.id !== rewardId)) throw new Error('Invalid reward');
    const title = String(candidate.title ?? '').trim();
    const cost = Number(candidate.cost);
    if (!title || title.length > 120 || !Number.isSafeInteger(cost) || cost < 1) throw new Error('Invalid reward');
    const iconType = candidate.icon?.type === 'photo' ? 'photo' : 'preset';
    const { error } = await client.from('reward_templates').insert({
      id: rewardId, workspace_id: workspaceId, title, cost,
      icon_type: iconType,
      icon_value: String(iconType === 'photo' ? candidate.icon?.uri ?? '🎁' : candidate.icon?.value ?? '🎁'),
      created_by: userId, created_at: candidate.createdAt ?? new Date().toISOString(),
    });
    // An insert racing another request must never become a privileged UPDATE.
    if (error && error.code !== '23505') throw error;
    reward = await readReward();
    if (!reward) throw new Error('Reward repair failed');
  }
  const { error } = await client.from('reward_assignments').upsert({
    workspace_id: workspaceId, reward_id: rewardId, profile_id: profileId,
  }, { onConflict: 'reward_id,profile_id', ignoreDuplicates: true });
  if (error) throw error;
}
