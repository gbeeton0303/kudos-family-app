import type { AuthEntryFields, AuthEntryMode } from '../cloud/authEntry.ts';
import { normalizeChildUsername, validateChildPassword } from '../cloud/childIdentity.ts';

export type FieldErrors = Partial<Record<'email' | 'password' | 'displayName' | 'inviteCode' | 'username' | 'confirmation' | 'legalAccepted', string>>;
export function validateEmail(email: string) {
  return !email.trim() ? 'Enter your email address.' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : 'Enter a valid email address, such as name@example.com.';
}
function usernameError(username: string) {
  if (!username.trim()) return 'Enter your username.';
  try { normalizeChildUsername(username); } catch (error) { return (error as Error).message; }
}
export function validateAuthFields(mode: AuthEntryMode, fields: AuthEntryFields): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'child') {
    if (!fields.inviteCode.trim()) errors.inviteCode = 'Enter the code given to you by your parent.';
    return errors;
  }
  if (mode === 'child-signin') errors.username = usernameError(fields.username ?? '');
  else errors.email = validateEmail(fields.email);
  if (!fields.password) errors.password = 'Enter your password.';
  const registration = mode === 'signup' || mode === 'adult';
  if (registration) {
    if (!fields.displayName.trim()) errors.displayName = 'Enter your name.';
    if (fields.password && fields.password.length < 6) errors.password = 'Use a password with at least 6 characters.';
    if (mode === 'adult' && !fields.inviteCode.trim()) errors.inviteCode = 'Enter the adult invitation code from your email.';
    if (!fields.legalAccepted) errors.legalAccepted = 'Accept the Terms of Service and Privacy Policy to continue.';
  }
  return errors;
}
export function validatePasswordConfirmation(password: string, confirmation: string, child = false): FieldErrors {
  const errors: FieldErrors = {};
  if (child) {
    try { validateChildPassword(password); } catch (error) { errors.password = (error as Error).message; }
  } else if (password.length < 8) errors.password = 'Use a password with at least 8 characters.';
  if (!confirmation) errors.confirmation = 'Confirm your password.';
  else if (password !== confirmation) errors.confirmation = 'Passwords don’t match.';
  return errors;
}
export function validateChildLoginFields(username: string, password: string, confirmation: string): FieldErrors {
  return { ...validatePasswordConfirmation(password, confirmation, true), username: usernameError(username) };
}
export function hasFieldErrors(errors: FieldErrors) {
  return Object.values(errors).some(Boolean);
}
