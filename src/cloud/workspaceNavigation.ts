import type { WorkspaceAccess } from './types';

export function alternativeManagerWorkspaces(access: WorkspaceAccess, workspaces: WorkspaceAccess[]): WorkspaceAccess[] {
  if (access.role === 'child') return [];
  return workspaces.filter((item) => item.workspaceId !== access.workspaceId && (item.role === 'parent' || item.role === 'teacher'));
}
