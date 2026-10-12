import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../src/components/CloudAccountModal.tsx', import.meta.url), 'utf8');

test('child device actions sit inside an accessible per-profile dropdown', () => {
  assert.match(source, /const expanded = expandedProfileId === profile\.id/);
  assert.match(source, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(source, /setExpandedProfileId\(expanded \? null : profile\.id\)/);
  assert.match(source, /\{expanded \? <View style=\{\[deviceStyles\.options/);
  for (const label of ['Create code', 'Replace device', 'Reset child login']) assert.ok(source.includes(label));
  assert.match(source, /minHeight: 50/);
});

test('generated codes are displayed only inside their named profile and reopen that dropdown', () => {
  assert.match(source, /invite\?\.profileId === profile\.id \? <View/);
  assert.match(source, />Code for \{profile\.name\}</);
  assert.match(source, /Use this code only for \{profile\.name\}’s profile/);
  assert.equal((source.match(/setExpandedProfileId\(profile\.id\);/g) ?? []).length, 2);
  assert.match(source, /setExpandedProfileId\(null\); setInvite\(null\)/);
});
