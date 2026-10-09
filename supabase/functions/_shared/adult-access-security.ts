export async function requireRemovableAdult(admin: any, workspaceId: string, targetUserId: string) {
  const { data: workspace, error: workspaceError } = await admin.from('workspaces')
    .select('created_by').eq('id', workspaceId).maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) throw new Error('This family or classroom could not be found.');
  const { data: entitlement, error } = await admin.from('workspace_entitlements')
    .select('billing_owner_id').eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw error;
  if (workspace.created_by === targetUserId || entitlement?.billing_owner_id === targetUserId) {
    throw new Error('The family or classroom creator and purchasing owner cannot be removed. Remove another invited adult instead.');
  }
}
