import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('reward goal value never auto-shrinks and the badge can grow with wrapped text', async () => {
  const source = await readFile(new URL('../src/components/CurrencyStorage.tsx', import.meta.url), 'utf8');
  const value = source.match(/<Text\s+accessibilityLabel=\{`Reward value:[\s\S]*?<\/Text>/)?.[0];
  assert.ok(value);
  assert.doesNotMatch(value, /adjustsFontSizeToFit|minimumFontScale|numberOfLines/);
  assert.match(source, /rewardGoalBadgeCost:\{fontSize:15,[^\n]*flexShrink:0/);
  const badge = source.match(/rewardGoalBadge:\{[^\n]*/)?.[0];
  assert.match(badge, /minHeight:64/);
  assert.match(badge, /minWidth:104,maxWidth:156/);
  assert.doesNotMatch(badge, /[,\{](height|width):/);
  assert.match(source, /translateX: -goalBadgeWidth \/ 2/);
});
test('account settings use the simplified sign-out label', async () => {
  const source = await readFile(new URL('../src/components/CloudAccountModal.tsx', import.meta.url), 'utf8');
  assert.match(source, />Sign Out of Kudos<\/Text>/);
  assert.doesNotMatch(source, /sign out of kudos cloud/i);
});
