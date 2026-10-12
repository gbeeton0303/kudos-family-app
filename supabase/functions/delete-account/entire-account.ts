// Kept separate from the legacy workspace-delete path so old clients retain
// their existing behavior. All authority comes from the authenticated user.
async function rows(query: () => any): Promise<any[]> {
  const result: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
}

export async function entireAccountAction(admin: any, user: any, body: any, deleteMediaPrefix: (prefix: string) => Promise<void>) {
  if (!['preview_entire_account', 'delete_entire_account'].includes(body.action)) throw new Error('Unknown deletion action.');
  if (user.is_anonymous || user.app_metadata?.account_type === 'child') throw new Error('Child accounts can delete only their own linked profile.');
  const memberships = await rows(() => admin.from('workspace_members').select('workspace_id,role').eq('user_id', user.id).order('workspace_id'));
  if (memberships.some((item) => item.role === 'child')) throw new Error('Child accounts cannot use adult account deletion.');
  const owned = await rows(() => admin.from('workspaces').select('id,name,type').eq('created_by', user.id).order('id'));
  const ownedIds = owned.map((item) => item.id).sort();
  const joinedIds = memberships.map((item) => item.workspace_id).filter((id) => !ownedIds.includes(id)).sort();
  const plan = { userId: user.id, ownedWorkspaces: owned, joinedWorkspaceIds: joinedIds };
  const prepare = async (apply: boolean) => {
    const { error } = await admin.rpc('prepare_entire_kudos_account_deletion', {
      p_user_id: user.id, p_owned_workspace_ids: ownedIds, p_joined_workspace_ids: joinedIds, p_apply: apply,
    });
    if (error) throw error;
  };
  // Require the safeguard migration BEFORE any Storage deletion takes place.
  await prepare(false);
  if (body.action === 'preview_entire_account') return { scope: 'account-preview', ...plan };
  const expected = body.expectedWorkspaceIds;
  if (body.confirm !== true || body.expectedUserId !== user.id || !Array.isArray(expected) || !Array.isArray(body.expectedJoinedWorkspaceIds)
    || JSON.stringify([...expected].sort()) !== JSON.stringify(ownedIds)
    || JSON.stringify([...(body.expectedJoinedWorkspaceIds ?? [])].sort()) !== JSON.stringify(joinedIds)) {
    throw new Error('Your workspaces changed or deletion was not confirmed. Review Delete My Entire Account again.');
  }

  const childIds = new Set<string>();
  for (const id of ownedIds) {
    const profiles = await rows(() => admin.from('child_profiles').select('id,linked_user_id').eq('workspace_id', id).order('id'));
    for (const profile of profiles) if (profile.linked_user_id) childIds.add(profile.linked_user_id);
  }
  const orphanChildren: string[] = [];
  for (const id of childIds) {
    const otherMemberships = await rows(() => admin.from('workspace_members').select('workspace_id,role').eq('user_id', id).order('workspace_id'));
    const otherProfiles = await rows(() => admin.from('child_profiles').select('id,workspace_id').eq('linked_user_id', id).order('id'));
    if (otherMemberships.some((item) => !ownedIds.includes(item.workspace_id)) || otherProfiles.some((item) => !ownedIds.includes(item.workspace_id))) continue;
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) throw error;
    // Never delete another adult's personal login, even if a bad legacy link exists.
    if (data?.user?.is_anonymous === true || data?.user?.app_metadata?.account_type === 'child') orphanChildren.push(id);
  }

  // Remove media before its workspace/profile cascades or Auth deletion.
  for (const id of ownedIds) await deleteMediaPrefix(id);
  for (const id of orphanChildren) {
    const { error } = await admin.auth.admin.deleteUser(id, false);
    if (error) throw error;
  }
  // Keep the owned workspaces/profile links until child Auth deletions succeed,
  // so a failed child deletion remains discoverable on a retry.
  await prepare(true);
  const { error } = await admin.auth.admin.deleteUser(user.id, false);
  if (error) throw error;
  return { deleted: true, scope: 'account', ...plan, deletedAuthUsers: orphanChildren.length + 1 };
}
