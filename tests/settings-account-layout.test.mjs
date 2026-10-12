import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('settings top badge shows first-name account and a separate family/classroom action', async () => {
  const source = await readFile(new URL('../src/screens/SettingsScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /accountFirstName\?\.trim\(\)\.split/);
  assert.match(source, /\{firstName\}’s Account/);
  assert.match(source, /title: \{ flex: 1, fontSize: 19/);
  assert.doesNotMatch(source, /<ScreenHeader[^>]*(subtitle|eyebrow)=/);
  assert.doesNotMatch(source, /<Text style=\{\[styles\.sectionLabel/);
  assert.match(source, /onPress=\{onOpenWorkspaces \?\? onOpenFamilyAccount\}/);
  assert.match(source, /teacherMode \? 'Classroom' : 'Family'/);
  assert.doesNotMatch(source, /label="Account"/);
});
test('workspace name editors are separate from account invitations and preserve raw email casing', async () => {
  const source = await readFile(new URL('../src/components/CloudAccountModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /manager && section === 'workspaces'/);
  assert.match(source, /if \(section === 'account'\) void refreshAdults/);
  assert.match(source, /textTransform: 'none'/);
  assert.doesNotMatch(source, /\{access\.role\} · \{syncStatus\}/);
  assert.doesNotMatch(source, />Your Workspaces</);
  assert.match(source, /Adult Account Access/);
  assert.match(source, /Device Invitations/);
});
