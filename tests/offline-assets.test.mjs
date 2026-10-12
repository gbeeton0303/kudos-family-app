import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { test } from 'node:test';

test('task and reward sticker images are bundled files, not internet URLs', async () => {
  const source = await readFile(new URL('../src/components/ItemIconView.tsx', import.meta.url), 'utf8');
  const paths = [...source.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(paths.length > 40);
  await Promise.all(paths.map((path) => access(new URL(path, new URL('../src/components/ItemIconView.tsx', import.meta.url)))));
  assert.match(source, /<CachedAssetImage source=\{BUNDLED_TASK_ICONS/);
});
test('cached built-in artwork prefers a device-local file while retaining bundled fallback', async () => {
  const source = await readFile(new URL('../src/components/CachedAssetImage.tsx', import.meta.url), 'utf8');
  assert.match(source, /useAssets\(\[source\]\)/);
  assert.match(source, /localUri \? \{ uri: localUri \} : source/);
});
