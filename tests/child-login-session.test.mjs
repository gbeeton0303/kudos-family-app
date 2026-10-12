import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeChildLoginSetup, ChildLoginSessionError } from '../src/cloud/completeChildLoginSetup.ts';

test('saving a child login automatically authenticates the same profile without refreshing the old session', async () => {
  const calls = [];
  await completeChildLoginSetup('happy_star', 'password27', 'child-id',
    async () => { calls.push('save'); },
    async (credentials) => {
      calls.push('sign-in');
      assert.deepEqual(credentials, { email: 'kudos-child-happy_star@child-login.invalid', password: 'password27' });
      return { data: { user: { id: 'child-id', app_metadata: { account_type: 'child' } } }, error: null };
    }, async () => { throw new Error('Unexpected sign out'); });
  assert.deepEqual(calls, ['save', 'sign-in']);
});
test('a credential save failure does not attempt sign in', async () => {
  await assert.rejects(completeChildLoginSetup('happy_star', 'password27', 'child-id',
    async () => { throw new Error('Username taken'); },
    async () => { assert.fail('Must not sign in'); }, async () => {}), /Username taken/);
});
test('a connection failure after saving is reported as login saved, not save failed', async () => {
  await assert.rejects(completeChildLoginSetup('happy_star', 'password27', 'child-id',
    async () => {}, async () => { throw new Error('Offline'); }, async () => {}), ChildLoginSessionError);
});
test('automatic child login rejects an adult or different child session', async () => {
  for (const user of [{ id: 'other-child', app_metadata: { account_type: 'child' } }, { id: 'child-id', app_metadata: { account_type: 'adult' } }]) {
    let signedOut = false;
    await assert.rejects(completeChildLoginSetup('happy_star', 'password27', 'child-id',
      async () => {}, async () => ({ data: { user }, error: null }), async () => { signedOut = true; }), ChildLoginSessionError);
    assert.equal(signedOut, true);
  }
});
