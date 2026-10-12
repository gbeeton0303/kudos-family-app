import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../src/screens/AuthScreen.tsx', import.meta.url), 'utf8');

test('child authentication copy refers only to parents and family codes', async () => {
  assert.match(source, />I Have a Parent Code</);
  assert.match(source, /'Enter Family Code'/);
  assert.match(source, /accessibilityLabel="Family code"/);
  assert.match(source, /Forgot your login\? Ask your parent to reset it/);
  assert.doesNotMatch(source, /Parent or Teacher Code|parent or teacher|Family or classroom code|Classroom students/);
  const setup = await readFile(new URL('../src/screens/ChildLoginSetupScreen.tsx', import.meta.url), 'utf8');
  assert.match(setup, /Your parent can reset your login/);
  assert.doesNotMatch(setup, /parent or teacher/);
});

test('authentication cards share compact back/title spacing and intrinsic sizing', () => {
  assert.match(source, /styles\.card, styles\.authCard/);
  assert.match(source, /<View style=\{styles\.headingGroup\}>[\s\S]*?styles\.backButton[\s\S]*?styles\.screenTitle[\s\S]*?<\/View>/);
  assert.match(source, /authCard: \{ padding: 24, paddingTop: 8 \}/);
  assert.match(source, /headingGroup: \{ gap: 4 \}/);
  assert.match(source, /backButton: \{[^}]*minHeight: 44[^}]*marginLeft: -12/);
  assert.match(source, /screenTitle: \{[^}]*fontSize: 24, lineHeight: 30/);
  assert.match(source, /screenDescription: \{[^}]*marginTop: 4/);
  assert.doesNotMatch(source, /authCard: \{[^}]*(?:minHeight|height|flex):/);
});
