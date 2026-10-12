import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { hasFieldErrors, validateAuthFields, validateChildLoginFields, validateEmail, validatePasswordConfirmation } from '../src/forms/authValidation.ts';

const valid = { email: 'adult@example.com', password: 'secret123', displayName: 'Alex', inviteCode: 'CODE123', legalAccepted: true, username: 'star_27' };
test('registration reports missing fields separately and accepts valid entries in every mode', () => {
  for (const mode of ['signup', 'adult']) {
    const errors = validateAuthFields(mode, { ...valid, email: '', password: '', displayName: '', inviteCode: '', legalAccepted: false });
    for (const field of ['email', 'password', 'displayName', 'legalAccepted']) assert.ok(errors[field]);
    assert.equal(Boolean(errors.inviteCode), mode === 'adult');
  }
  for (const mode of ['signup', 'adult', 'signin', 'child', 'child-signin']) assert.equal(hasFieldErrors(validateAuthFields(mode, valid)), false);
});
test('email validation trims spaces and identifies invalid email formats', () => {
  for (const email of ['', 'missing-at.com', 'a@', 'a @example.com']) assert.ok(validateEmail(email));
  assert.equal(validateEmail(' adult+test@example.com '), undefined);
});
test('sign-in does not impose new password requirements or require adult registration fields', () => {
  assert.equal(hasFieldErrors(validateAuthFields('signin', { ...valid, password: 'x', displayName: '', inviteCode: '', legalAccepted: false })), false);
  assert.equal(hasFieldErrors(validateAuthFields('child-signin', { ...valid, email: '', password: 'x', legalAccepted: false })), false);
  assert.ok(validateAuthFields('signup', { ...valid, password: 'short' }).password);
});
test('child code and username errors remain attached to their own fields', () => {
  assert.deepEqual(validateAuthFields('child', { ...valid, inviteCode: '' }), { inviteCode: 'Enter the code given to you by your parent.' });
  for (const username of ['', 'a', '1234', 'two words']) assert.ok(validateAuthFields('child-signin', { ...valid, username }).username);
  assert.equal(hasFieldErrors(validateAuthFields('child-signin', { ...valid, username: ' STAR_27 ' })), false);
});
test('password setup and recovery distinguish missing confirmation from mismatched passwords', () => {
  assert.ok(validateChildLoginFields('star_27', 'short', 'short').password);
  assert.ok(validateChildLoginFields('star_27', 'x'.repeat(129), 'x'.repeat(129)).password);
  assert.equal(validateChildLoginFields('star_27', 'password123', 'different').confirmation, 'Passwords don’t match.');
  assert.equal(validatePasswordConfirmation('password123', '').confirmation, 'Confirm your password.');
  assert.equal(hasFieldErrors(validateChildLoginFields('star_27', 'password123', 'password123')), false);
  assert.equal(hasFieldErrors(validatePasswordConfirmation('password123', 'password123')), false);
});
test('forms stop invalid submissions before authentication and expose accessible inline errors', async () => {
  const auth = await readFile(new URL('../src/screens/AuthScreen.tsx', import.meta.url), 'utf8');
  const child = await readFile(new URL('../src/screens/ChildLoginSetupScreen.tsx', import.meta.url), 'utf8');
  const error = await readFile(new URL('../src/components/FieldError.tsx', import.meta.url), 'utf8');
  assert.match(auth, /if \(hasFieldErrors\(validateAuthFields[\s\S]*?return;[\s\S]*?performAuthEntry/);
  assert.match(auth, /setValidationShown\(false\)/);
  assert.match(child, /if \(hasFieldErrors\(validateChildLoginFields[\s\S]*?return;[\s\S]*?auth\.setupChildLogin/);
  assert.match(error, /accessibilityRole="alert" accessibilityLiveRegion="polite"/);
});
