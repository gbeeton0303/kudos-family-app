import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { entireAccountAction } from './entire-account.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId ?? '');
    const entire = body.action === 'preview_entire_account' || body.action === 'delete_entire_account';
    if (!entire && !workspaceId) return jsonResponse({ error: 'Workspace is required.' }, 400);
    if (body.action && !entire) return jsonResponse({ error: 'Unknown deletion action.' }, 400);

    const admin = serviceClient();
    const deleteMediaPrefix = async (rootPrefix: string) => {
      const bucket = admin.storage.from('brightsteps-media');
      const pending = [rootPrefix];
      const files: string[] = [];
      while (pending.length) {
        const prefix = pending.pop()!;
        let offset = 0;
        while (true) {
          const { data: entries, error } = await bucket.list(prefix, { limit: 100, offset });
          if (error) throw error;
          for (const entry of entries ?? []) {
            const path = `${prefix}/${entry.name}`;
            if (entry.id) files.push(path);
            else pending.push(path);
          }
          if (!entries || entries.length < 100) break;
          offset += entries.length;
        }
      }
      for (let index = 0; index < files.length; index += 100) {
        const { error } = await bucket.remove(files.slice(index, index + 100));
        if (error) throw error;
      }
    };
    if (entire) return jsonResponse({ data: await entireAccountAction(admin, user, body, deleteMediaPrefix) });
    const { data: membership, error: membershipError } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return jsonResponse({ error: 'You do not have access to this account.' }, 403);

    if (membership.role === 'child') {
      const { data: profile, error: profileError } = await admin
        .from('child_profiles')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('linked_user_id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      // Deleting the linked child profile cascades that child's assignments,
      // completions, requests, redemptions, deliveries, and balance-reset data.
      if (profile?.id) {
        await deleteMediaPrefix(`${workspaceId}/profiles/${profile.id}`);
        const { error: deleteProfileError } = await admin.from('child_profiles').delete().eq('id', profile.id);
        if (deleteProfileError) throw deleteProfileError;
      } else {
        await admin.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', user.id);
      }

      const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id, false);
      if (deleteUserError) throw deleteUserError;
      return jsonResponse({ data: { deleted: true, scope: 'child' } });
    }

    if (membership.role !== 'parent' && membership.role !== 'teacher') {
      return jsonResponse({ error: 'Only a family or classroom manager can delete this workspace.' }, 403);
    }

    // Capture every Auth account attached to this workspace before cascading
    // family data. That includes adult members and linked child accounts.
    const [{ data: members, error: membersError }, { data: linkedProfiles, error: linkedError }] = await Promise.all([
      admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId),
      admin.from('child_profiles').select('linked_user_id').eq('workspace_id', workspaceId).not('linked_user_id', 'is', null),
    ]);
    if (membersError) throw membersError;
    if (linkedError) throw linkedError;

    const workspaceUserIds = [...new Set([
      ...(members ?? []).map((member) => member.user_id),
      ...(linkedProfiles ?? []).map((profile) => profile.linked_user_id),
    ].filter(Boolean))] as string[];

    // An adult may manage more than one workspace. Only delete an Auth account
    // when this is its last workspace; otherwise retain the login and remove
    // only the family selected for deletion.
    const usersWithOtherWorkspaces = new Set<string>();
    if (workspaceUserIds.length) {
      const { data: outsideMemberships, error: outsideError } = await admin
        .from('workspace_members')
        .select('user_id')
        .in('user_id', workspaceUserIds)
        .neq('workspace_id', workspaceId);
      if (outsideError) throw outsideError;
      for (const outsideMembership of outsideMemberships ?? []) usersWithOtherWorkspaces.add(outsideMembership.user_id);
    }

    const usersToDelete = workspaceUserIds.filter((userId) => !usersWithOtherWorkspaces.has(userId));
    const currentAccountRetained = !usersToDelete.includes(user.id);

    // Storage ownership can block Auth deletion. Remove the complete workspace
    // prefix before deleting any member account, then hard-delete the invoking
    // manager last so the authorized request can finish and return a result.
    await deleteMediaPrefix(workspaceId);
    const orderedUserIds = [
      ...usersToDelete.filter((userId) => userId !== user.id),
      ...usersToDelete.filter((userId) => userId === user.id),
    ];
    for (const accountUserId of orderedUserIds) {
      const { error } = await admin.auth.admin.deleteUser(accountUserId, false);
      if (error) {
        throw new Error(`The Supabase Auth account ${accountUserId} could not be deleted. ${error.message}`);
      }
    }

    // The Auth deletion trigger may already have removed the workspace when the
    // final manager was deleted. This idempotent delete handles retained adults
    // and any workspace that still exists.
    const { error: workspaceDeleteError } = await admin.from('workspaces').delete().eq('id', workspaceId);
    if (workspaceDeleteError) throw workspaceDeleteError;

    return jsonResponse({
      data: {
        deleted: true,
        scope: 'family',
        accountRetained: currentAccountRetained,
        deletedAuthUsers: usersToDelete.length,
        retainedAuthUsers: usersWithOtherWorkspaces.size,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
