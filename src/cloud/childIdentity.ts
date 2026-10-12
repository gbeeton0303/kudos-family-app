// The .invalid domain is reserved and cannot deliver email. Children never
// supply an email; Supabase alone handles password hashing and login throttling.
export function normalizeChildUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{3,23}$/.test(username)) throw new Error('Choose a username with 4–24 letters, numbers, or underscores, starting with a letter.');
  return username;
}
export function childLoginAddress(username: string) {
  return `kudos-child-${normalizeChildUsername(username)}@child-login.invalid`;
}
export function validateChildPassword(password: string) {
  if (password.length < 8 || password.length > 128) throw new Error('Use a password with 8–128 characters.');
}
export function isChildIdentity(user: { is_anonymous?: boolean; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined) {
  // Metadata fallback only hides adult UI in legacy builds; database authority
  // always comes from server-owned classification and current memberships.
  return user?.is_anonymous === true || user?.app_metadata?.account_type === 'child' || user?.user_metadata?.account_type === 'child';
}
