import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { childLoginAction } from './child-login.ts';

const CHILD_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateChildCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => CHILD_CODE_ALPHABET[byte % CHILD_CODE_ALPHABET.length]).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { client, user } = await requireUser(req);
    const body = await req.json();
    if (body.action === 'set-child-login' || body.action === 'reset-child-login') {
      const admin = serviceClient();
      const { data: allowed, error } = await admin.rpc('consume_profile_invite_attempt', { p_key_hash: await sha256(`child-login:${user.id}`) });
      if (error) throw error;
      if (!allowed) return jsonResponse({ error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);
      return jsonResponse({ data: await childLoginAction(admin, user, body) });
    }
    if (body.action === 'create') {
      const { data, error } = await client.rpc('create_profile_invite', { p_profile_id: body.profileId, p_hours: body.hours ?? 168 });
      if (error) throw error;
      return jsonResponse({ data });
    }
    if (body.action === 'replace') {
      const profileId = String(body.profileId ?? '');
      if (!profileId) throw new Error('Choose a child profile first.');

      const admin = serviceClient();
      const { data: profile, error: profileError } = await admin
        .from('child_profiles')
        .select('id,workspace_id,linked_user_id')
        .eq('id', profileId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error('Child profile not found.');

      const { data: membership, error: membershipError } = await admin
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', profile.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership || !['parent', 'teacher'].includes(membership.role)) throw new Error('Only a parent or teacher can replace a child device.');

      // Revoke all existing codes first. Deleting the old anonymous Auth user
      // immediately removes its membership and clears linked_user_id through
      // foreign-key actions, while preserving the child profile and history.
      const { error: revokeError } = await admin
        .from('profile_invites')
        .update({ used_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .is('used_at', null);
      if (revokeError) throw revokeError;

      if (profile.linked_user_id) {
        const { data: oldAccount, error: accountError } = await admin.auth.admin.getUserById(profile.linked_user_id);
        if (accountError) throw new Error(`The old child login could not be checked. ${accountError.message}`);
        if (oldAccount.user?.is_anonymous || oldAccount.user?.app_metadata?.account_type === 'child') {
          const { error: deleteError } = await admin.auth.admin.deleteUser(profile.linked_user_id);
          if (deleteError) throw new Error(`The old child login could not be revoked. ${deleteError.message}`);
        } else {
          // Historical data may contain a non-anonymous user link. Never delete
          // an adult Auth account. Remove only a child-role membership; parent
          // or teacher membership remains intact.
          const { error: memberDeleteError } = await admin.from('workspace_members').delete()
            .eq('workspace_id', profile.workspace_id)
            .eq('user_id', profile.linked_user_id)
            .eq('role', 'child');
          if (memberDeleteError) throw memberDeleteError;
        }
      }
      const { error: unlinkError } = await admin.from('child_profiles').update({ linked_user_id: null }).eq('id', profileId);
      if (unlinkError) throw unlinkError;

      const code = generateChildCode();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: invitation, error: inviteError } = await admin.from('profile_invites').insert({
        workspace_id: profile.workspace_id,
        profile_id: profileId,
        code_hash: await sha256(code.toLowerCase()),
        created_by: user.id,
        expires_at: expiresAt,
      }).select('id').single();
      if (inviteError) throw inviteError;

      return jsonResponse({ data: { invite_id: invitation.id, code, expires_at: expiresAt, profile_id: profileId, replaced: Boolean(profile.linked_user_id) } });
    }
    if (body.action === 'accept') {
      if (!user.is_anonymous) throw new Error('A child code can only be used while creating a child account.');
      const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      const rateKey = forwarded || req.headers.get('cf-connecting-ip') || `user:${user.id}`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rateKey));
      const keyHash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
      const { data: allowed, error: rateError } = await serviceClient().rpc('consume_profile_invite_attempt', { p_key_hash: keyHash });
      if (rateError) throw rateError;
      if (!allowed) return jsonResponse({ error: 'Too many code attempts. Wait 15 minutes and try again.' }, 429);
      const { data, error } = await client.rpc('accept_profile_invite', { p_code: body.code });
      if (error) throw error;
      return jsonResponse({ data });
    }
    if (body.action === 'cleanup-failed-child') {
      const { user } = await requireUser(req);
      if (!user.is_anonymous) throw new Error('Only an unfinished child signup can be cleaned up.');
      const admin = serviceClient();
      const { count, error: membershipError } = await admin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      if (membershipError) throw membershipError;
      if ((count ?? 0) > 0) throw new Error('This child account is already linked.');
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return jsonResponse({ data: { deleted: true } });
    }
    return jsonResponse({ error: 'Unknown invite action' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
