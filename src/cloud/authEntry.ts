import { normalizeChildUsername } from './childIdentity.ts';
export type AuthEntryMode = 'signin' | 'signup' | 'adult' | 'child' | 'child-signin';
export type AuthEntryFields = { email: string; password: string; displayName: string; inviteCode: string; legalAccepted: boolean; username?: string };

export async function performAuthEntry(mode: AuthEntryMode, fields: AuthEntryFields, actions: {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, inviteCode?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  createChildAccount: (code: string) => Promise<void>;
  signInChild?: (username: string, password: string) => Promise<void>;
  savePendingAdultInvite: (code: string) => Promise<void>;
  clearPendingAdultInvite: () => Promise<void>;
}): Promise<{ needsEmailConfirmation: boolean }> {
  const code = fields.inviteCode.trim().toUpperCase();
  if (mode === 'child-signin') {
    const username = normalizeChildUsername(fields.username ?? '');
    if (!fields.password) throw new Error('Enter your password.');
    if (!actions.signInChild) throw new Error('Child Sign In is unavailable.');
    await actions.signInChild(username, fields.password);
    return { needsEmailConfirmation: false };
  }
  if (mode === 'child') {
    if (!code) throw new Error('Enter the code given to you by your parent or teacher.');
    await actions.createChildAccount(code);
    return { needsEmailConfirmation: false };
  }
  const email = fields.email.trim();
  if (!email || !fields.password) throw new Error('Enter your email address and password.');
  if (mode === 'signin') {
    await actions.signIn(email, fields.password);
    return { needsEmailConfirmation: false };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (fields.password.length < 6) throw new Error('Use a password with at least 6 characters.');
  if (!fields.displayName.trim()) throw new Error('Enter your name.');
  if (mode === 'adult' && !code) throw new Error('Enter the adult invitation code from your email.');
  if (!fields.legalAccepted) throw new Error('Review and accept the Terms of Service and Privacy Policy before creating an adult account.');
  if (mode === 'adult') await actions.savePendingAdultInvite(code);
  else await actions.clearPendingAdultInvite();
  try {
    return await actions.signUp(email, fields.password, fields.displayName.trim(), mode === 'adult' ? code : undefined);
  } catch (error) {
    if (mode === 'adult') await actions.clearPendingAdultInvite().catch(() => undefined);
    throw error;
  }
}
