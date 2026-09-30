import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('striped profile overlays cover the full tablet content width', async () => {
  const overlay = await read('../src/components/ProfilePatternOverlay.tsx');
  assert.match(overlay, /Array\.from\(\{ length: 42 \}/);
  assert.match(overlay, /left: index \* 40 - 260/);
});

test('child task submission displays the transparent paper-airplane asset', async () => {
  const profile = await read('../src/screens/ProfileDetailScreen.tsx');
  const png = await readFile(new URL('../assets/branding/child-send-parent.png', import.meta.url));
  assert.match(profile, /child-send-parent\.png/);
  assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71], 'asset must be a PNG');
  assert.equal(png[25], 6, 'PNG must use RGBA color with an alpha channel');
});
