import { childLoginAddress } from './childIdentity.ts';

export class ChildLoginSessionError extends Error {
  constructor() {
    super('Your username and password were saved, but Kudos could not reconnect right now. Continue to your profile, or use Child Sign In with your new login if you are signed out.');
    this.name = 'ChildLoginSessionError';
  }
}

export async function completeChildLoginSetup(
  username: string, password: string, expectedUserId: string,
  save: (username: string, password: string) => Promise<unknown>,
  signIn: (credentials: { email: string; password: string }) => Promise<{
    data: { user: { id: string; app_metadata?: Record<string, unknown> } | null }; error: unknown;
  }>,
  rejectSession: () => Promise<unknown>,
) {
  await save(username, password);
  // Password conversion can invalidate the anonymous refresh token. Acquire
  // the replacement session automatically using the newly saved credentials.
  let result: Awaited<ReturnType<typeof signIn>>;
  try { result = await signIn({ email: childLoginAddress(username), password }); }
  catch { throw new ChildLoginSessionError(); }
  if (result.error || !result.data.user) throw new ChildLoginSessionError();
  if (result.data.user.id !== expectedUserId || result.data.user.app_metadata?.account_type !== 'child') {
    await rejectSession();
    throw new ChildLoginSessionError();
  }
}
