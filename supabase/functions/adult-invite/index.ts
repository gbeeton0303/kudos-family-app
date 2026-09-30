import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requireManager(admin: ReturnType<typeof serviceClient>, workspaceId: string, userId: string) {
  const { data, error } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data || !['parent', 'teacher'].includes(data.role)) throw new Error('Only a family manager can manage adult access.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { user } = await requireUser(req);
    const admin = serviceClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    if (action === 'create') {
      const workspaceId = String(body.workspaceId ?? '');
      const invitedEmail = normalizeEmail(body.email);
      if (!workspaceId || !invitedEmail.includes('@')) throw new Error('Enter a valid adult email address.');
      await requireManager(admin, workspaceId, user.id);
      if (normalizeEmail(user.email) === invitedEmail) throw new Error('You are already a member of this family.');

      const { data: workspace, error: workspaceError } = await admin.from('workspaces').select('id,name,type').eq('id', workspaceId).maybeSingle();
      if (workspaceError) throw workspaceError;
      if (!workspace || workspace.type !== 'family') throw new Error('This family account could not be found.');

      // Validate mail delivery before changing any existing invitation rows.
      // This avoids leaving an unusable active code behind when production
      // secrets have not yet been configured.
      const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
      const from = Deno.env.get('KUDOS_INVITE_FROM')?.trim();
      if (!apiKey || !from) throw new Error('Adult invitations are not configured for this Supabase project. Add RESEND_API_KEY and KUDOS_INVITE_FROM to the production Edge Function secrets.');

      const { data: members, error: membersError } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'parent');
      if (membersError) throw membersError;
      for (const member of members ?? []) {
        const { data } = await admin.auth.admin.getUserById(member.user_id);
        if (normalizeEmail(data.user?.email) === invitedEmail) throw new Error('This adult already belongs to this family.');
      }

      await admin.from('adult_invites').update({ revoked_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('invited_email', invitedEmail).is('accepted_at', null).is('revoked_at', null);
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const { data: invitation, error: inviteError } = await admin.from('adult_invites').insert({ workspace_id: workspaceId, invited_email: invitedEmail, code_hash: await sha256(code), invited_by: user.id, expires_at: expiresAt }).select('id,invited_email,expires_at,created_at').single();
      if (inviteError) throw inviteError;

      const shownCode = `${code.slice(0, 5)}-${code.slice(5)}`;
      try {
        const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
          from, to: [invitedEmail], subject: `You're invited to join ${workspace.name} on Kudos Family`,
          text: `You've been invited to help manage ${workspace.name} on Kudos Family.\n\nInvitation code: ${shownCode}\n\nOpen Kudos Family, choose Join a Family as an Adult, and enter this code. It expires in 48 hours. Accepting gives you full family access, including the ability to delete the family account.`,
          html: `<div style="background:#f4fbf8;padding:32px 16px;font-family:Arial,sans-serif;color:#183437"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #d5e9e4;border-radius:24px;padding:32px"><h1 style="color:#0b756f;text-align:center">Welcome to Kudos Family</h1><p>You've been invited to help manage <strong>${escapeHtml(workspace.name)}</strong>.</p><p>Open Kudos Family, choose <strong>Join a Family as an Adult</strong>, and enter:</p><div style="margin:24px 0;padding:18px;background:#fff3cd;border:2px solid #e9a91a;border-radius:16px;text-align:center;font-size:30px;font-weight:800;letter-spacing:4px">${shownCode}</div><p style="color:#5f7475">This invitation expires in 48 hours. Accepting gives you full parent access, including the ability to manage or permanently delete the family account.</p></div></div>`,
        }) });
        if (!response.ok) throw new Error(await response.text());
      } catch (emailError) {
        await admin.from('adult_invites').delete().eq('id', invitation.id);
        throw new Error(`The invitation email could not be sent: ${emailError instanceof Error ? emailError.message : String(emailError)}`);
      }
      return jsonResponse({ data: { invitation, sent: true } });
    }

    if (action === 'accept') {
      const email = normalizeEmail(user.email);
      const code = normalizeCode(body.code);
      if (!email || !user.email_confirmed_at) throw new Error('Confirm your email before accepting this invitation.');
      if (code.length !== 10) throw new Error('Enter the complete invitation code.');
      const { data: invitation, error } = await admin.from('adult_invites').select('id,workspace_id,invited_email,expires_at,accepted_at,accepted_by,revoked_at').eq('code_hash', await sha256(code)).maybeSingle();
      if (error) throw error;
      if (!invitation) throw new Error('This invitation code is not valid.');
      if (normalizeEmail(invitation.invited_email) !== email) throw new Error('Sign in with the same email address that received the invitation.');
      // A confirmation link, app restart, or metadata cleanup can retry the
      // same acceptance. Return the existing membership for the same adult.
      if (invitation.accepted_at) {
        if (invitation.accepted_by === user.id) return jsonResponse({ data: { accepted: true, already_accepted: true, workspace_id: invitation.workspace_id, role: 'parent' } });
        throw new Error('This invitation has already been used.');
      }
      if (invitation.revoked_at) throw new Error('This invitation was cancelled.');
      if (new Date(invitation.expires_at).getTime() <= Date.now()) throw new Error('This invitation has expired.');
      const { error: memberError } = await admin.from('workspace_members').upsert({ workspace_id: invitation.workspace_id, user_id: user.id, role: 'parent' }, { onConflict: 'workspace_id,user_id' });
      if (memberError) throw memberError;
      const { error: acceptError } = await admin.from('adult_invites').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', invitation.id).is('accepted_at', null).is('revoked_at', null);
      if (acceptError) throw acceptError;
      return jsonResponse({ data: { accepted: true, workspace_id: invitation.workspace_id, role: 'parent' } });
    }

    if (action === 'list') {
      const workspaceId = String(body.workspaceId ?? '');
      await requireManager(admin, workspaceId, user.id);
      const [{ data: members, error: memberError }, { data: invites, error: inviteError }] = await Promise.all([
        admin.from('workspace_members').select('user_id,role,created_at').eq('workspace_id', workspaceId).in('role', ['parent', 'teacher']).order('created_at'),
        admin.from('adult_invites').select('id,invited_email,expires_at,created_at').eq('workspace_id', workspaceId).is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
      ]);
      if (memberError) throw memberError;
      if (inviteError) throw inviteError;
      const adults = [];
      for (const member of members ?? []) {
        const { data } = await admin.auth.admin.getUserById(member.user_id);
        adults.push({ userId: member.user_id, email: data.user?.email ?? 'Adult account', role: member.role, isCurrentUser: member.user_id === user.id });
      }
      return jsonResponse({ data: { adults, invitations: invites ?? [] } });
    }

    if (action === 'cancel') {
      const invitationId = String(body.invitationId ?? '');
      const { data: invite, error } = await admin.from('adult_invites').select('workspace_id').eq('id', invitationId).maybeSingle();
      if (error) throw error;
      if (!invite) throw new Error('Invitation not found.');
      await requireManager(admin, invite.workspace_id, user.id);
      const { error: cancelError } = await admin.from('adult_invites').update({ revoked_at: new Date().toISOString() }).eq('id', invitationId).is('accepted_at', null);
      if (cancelError) throw cancelError;
      return jsonResponse({ data: { cancelled: true } });
    }

    if (action === 'remove') {
      const workspaceId = String(body.workspaceId ?? '');
      const targetUserId = String(body.userId ?? '');
      await requireManager(admin, workspaceId, user.id);
      if (!targetUserId || targetUserId === user.id) throw new Error('Use Leave Family to remove your own access.');
      const { data: target, error: targetError } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', targetUserId).maybeSingle();
      if (targetError) throw targetError;
      if (!target || !['parent', 'teacher'].includes(target.role)) throw new Error('This adult is not a manager of the family.');
      const { count, error: countError } = await admin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('role', ['parent', 'teacher']);
      if (countError) throw countError;
      if ((count ?? 0) <= 1) throw new Error('A family must keep at least one adult manager.');
      const { error: removeError } = await admin.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', targetUserId);
      if (removeError) throw removeError;
      return jsonResponse({ data: { removed: true } });
    }

    return jsonResponse({ error: 'Unknown adult invitation action.' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'The invitation request failed.' }, 400);
  }
});
