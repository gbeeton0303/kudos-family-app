import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

for (const [file, handler, parameter, type] of [
  ['TaskLibraryModal', 'beginEdit', 'task', 'ChildTask'],
  ['RewardLibraryModal', 'editReward', 'reward', 'ChildReward'],
]) {
  test(`${file}: every edit tap scrolls, including switching items and editing the same item again`, async () => {
    const source = await readFile(new URL(`../src/components/${file}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /<ScrollView ref=\{scrollRef\}/);
    const start = source.indexOf(`const ${handler} = (`);
    const end = source.indexOf('\n  };', start);
    assert.ok(start >= 0 && end > start);
    const code = source.slice(start, end + 5).replace(`${parameter}: ${type}`, parameter);
    const frames = [];
    const scrolls = [];
    const state = {};
    const context = {
      scrollRef: { current: { scrollTo: (options) => scrolls.push(options) } },
      requestAnimationFrame: (callback) => frames.push(callback),
      toDateKey: () => '2026-10-11',
    };
    for (const setter of code.matchAll(/\b(set\w+)\(/g)) {
      context[setter[1]] = (value) => { state[setter[1]] = value; };
    }
    const edit = runInNewContext(`${code}\n${handler}`, context);
    const item = (id) => ({ id, title: id, amount: 5, cost: 25, frequency: 'daily', icon: {}, assignedProfileIds: [] });
    for (const id of ['first', 'second', 'second']) {
      edit(item(id));
      assert.equal(state.setTitle, id);
      assert.equal(state.setShowComposer, true);
      assert.equal(frames.length, 1);
      frames.shift()();
    }
    assert.equal(scrolls.length, 3);
    assert.ok(scrolls.every(({ y, animated }) => y === 0 && animated === true));
    context.scrollRef.current = null;
    edit(item('closed'));
    assert.doesNotThrow(() => frames.shift()());
  });
}
