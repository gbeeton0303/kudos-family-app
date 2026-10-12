import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const auth = await readFile(new URL('../src/screens/AuthScreen.tsx', import.meta.url), 'utf8');
const setup = await readFile(new URL('../src/screens/ChildLoginSetupScreen.tsx', import.meta.url), 'utf8');
function field(source, label) {
  const tag = source.match(new RegExp(`<TextInput\\b[^\\n]*?accessibilityLabel="${label}"[^\\n]*?/>`));
  assert.ok(tag, `${label} input exists`);
  assert.match(tag[0], /submitBehavior="submit"/);
  return tag[0];
}
test('adult and child sign-in fields move focus with Next and submit with Go', () => {
  assert.match(field(auth, 'Your name'), /returnKeyType="next"[\s\S]*emailRef\.current\?\.focus\(\)/);
  for (const label of ['Email address', 'Child username']) assert.match(field(auth, label), /returnKeyType="next"[\s\S]*passwordRef\.current\?\.focus\(\)/);
  assert.match(field(auth, 'Password'), /screen === 'adult' \? 'next' : 'go'/);
  assert.match(field(auth, 'Password'), /if \(screen === 'adult'\) inviteRef\.current\?\.focus\(\); else void submit\(\)/);
  for (const label of ['Adult invitation code', 'Family code']) assert.match(field(auth, label), /returnKeyType="go"[\s\S]*void submit\(\)/);
});
test('child setup and password recovery move to confirmation and submit from the last field', () => {
  assert.match(field(setup, 'Child username'), /returnKeyType="next"[\s\S]*passwordRef\.current\?\.focus\(\)/);
  assert.match(field(setup, 'Child password'), /returnKeyType="next"[\s\S]*confirmationRef\.current\?\.focus\(\)/);
  assert.match(field(auth, 'New password'), /returnKeyType="next"[\s\S]*confirmationRef\.current\?\.focus\(\)/);
  for (const [source, label] of [[setup, 'Confirm child password'], [auth, 'Confirm new password']]) assert.match(field(source, label), /returnKeyType="go"[\s\S]*void save\(\)/);
});
test('keyboard submission retains validation and duplicate-request guards', () => {
  for (const source of [auth, setup]) {
    assert.match(source, /if \(running\.current/);
    assert.match(source, /if \(hasFieldErrors\([\s\S]*?return;[\s\S]*?Keyboard\.dismiss\(\)/);
  }
  assert.match(auth, /if \(hasFieldErrors\(validatePasswordConfirmation[\s\S]*?return;[\s\S]*?running\.current = true/);
});
