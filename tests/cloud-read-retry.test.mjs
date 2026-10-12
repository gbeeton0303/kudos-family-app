import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryCloudRead } from '../src/cloud/retryCloudRead.ts';

test('successful sign-in snapshot returns immediately without a retry delay', async () => {
  const snapshot = { profiles: [] };
  assert.equal(await retryCloudRead(async () => snapshot, async () => assert.fail('No wait expected')), snapshot);
});
test('temporary startup failures recover automatically with bounded quick retries', async () => {
  let calls = 0;
  const delays = [];
  const result = await retryCloudRead(async () => {
    calls += 1;
    if (calls < 3) throw new Error('Temporary connection failure');
    return 'synced';
  }, async (delay) => { delays.push(delay); });
  assert.equal(result, 'synced');
  assert.deepEqual(delays, [400, 1200]);
  assert.equal(calls, 3);
});
test('persistent offline errors remain visible after the bounded attempts', async () => {
  let calls = 0;
  const failure = new Error('Offline');
  await assert.rejects(retryCloudRead(async () => { calls += 1; throw failure; }, async () => {}), (error) => error === failure);
  assert.equal(calls, 3);
});
