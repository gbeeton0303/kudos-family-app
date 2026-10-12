import { childLoginAddress, normalizeChildUsername, validateChildPassword } from '../../../src/cloud/childIdentity.ts';

export async function childLoginAction(admin: any, user: any, body: any) {
  const username = normalizeChildUsername(String(body.username ?? ''));
  const password = String(body.password ?? '');
  validateChildPassword(password);
  let target = user;
  if (body.action === 'reset-child-login') {
    const { data: profile, error } = await admin.from('child_profiles').select('id,workspace_id,linked_user_id').eq('id', String(body.profileId ?? '')).maybeSingle();
    if (error) throw error;
    if (!profile?.linked_user_id) throw new Error('This profile has no linked login. Create a code first.');
    const { data: member, error: memberError } = await admin.from('workspace_members').select('role').eq('workspace_id', profile.workspace_id).eq('user_id', user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member || !['parent', 'teacher'].includes(member.role)) throw new Error('Only this profile’s parent or teacher can reset its login.');
    const { data, error: targetError } = await admin.auth.admin.getUserById(profile.linked_user_id);
    if (targetError) throw targetError;
    target = data.user;
  } else if (body.action !== 'set-child-login') throw new Error('Unknown child login action.');
  if (!target || !(target.is_anonymous || target.app_metadata?.account_type === 'child')) throw new Error('An adult login cannot be converted to a child login.');
  // A child may retry initial setup, but must not overwrite an established
  // password without parent-controlled recovery (or normal Auth updateUser).
  if (body.action === 'set-child-login' && !target.is_anonymous) throw new Error('Your child login is already set up. Ask your parent to reset it if needed.');
  const { error: boundaryError } = await admin.rpc('prepare_child_login', { p_user_id: target.id });
  if (boundaryError) throw boundaryError;
  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
    email: childLoginAddress(username), email_confirm: true, password,
    app_metadata: { ...target.app_metadata, account_type: 'child', child_username: username },
    user_metadata: { ...target.user_metadata, account_type: 'child' },
  });
  if (updateError) {
    if (/already|registered|exists|duplicate/i.test(updateError.message)) throw new Error('That username is unavailable. Choose another.');
    throw new Error('Could not save the child login. Check the password requirements and try again.');
  }
  return { username, saved: true };
}
