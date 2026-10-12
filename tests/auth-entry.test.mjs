import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { performAuthEntry } from '../src/cloud/authEntry.ts';

const fields = { email:' adult@example.com ',password:'password123',displayName:' Adult ',inviteCode:' abcd1234 ',legalAccepted:true };
function actions() {
  const calls = [];
  const result = { needsEmailConfirmation:true };
  return { calls,result,
    signIn: async (...args) => { calls.push(['signin',...args]); },
    signUp: async (...args) => { calls.push(['signup',...args]); return result; },
    createChildAccount: async (...args) => { calls.push(['child',...args]); },
    savePendingAdultInvite: async (...args) => { calls.push(['save',...args]); },
    clearPendingAdultInvite: async () => { calls.push(['clear']); },
  };
}
test('child access connects the existing profile using only a normalized code', async () => {
  const api = actions();
  const result = await performAuthEntry('child',{ email:'',password:'',displayName:'',legalAccepted:false,inviteCode:' abcd1234 ' },api);
  assert.deepEqual(api.calls,[['child','ABCD1234']]);
  assert.equal(result.needsEmailConfirmation,false);
});
test('missing or rejected child codes never invoke adult registration', async () => {
  const api = actions();
  await assert.rejects(performAuthEntry('child',{ ...fields,inviteCode:' ' },api),/Enter the code/);
  assert.deepEqual(api.calls,[]);
  api.createChildAccount = async () => { throw new Error('Expired or already used code'); };
  await assert.rejects(performAuthEntry('child',fields,api),/Expired/);
  assert.deepEqual(api.calls,[]);
});
test('new adult registration clears stale invitations and retains email confirmation', async () => {
  const api = actions();
  assert.deepEqual(await performAuthEntry('signup',fields,api),api.result);
  assert.deepEqual(api.calls,[['clear'],['signup','adult@example.com','password123','Adult',undefined]]);
});
test('joining saves the adult code before registration and preserves it for email confirmation', async () => {
  const api = actions();
  await performAuthEntry('adult',fields,api);
  assert.deepEqual(api.calls,[['save','ABCD1234'],['signup','adult@example.com','password123','Adult','ABCD1234']]);
});
test('failed invited-adult registration cleans up the pending invite', async () => {
  const api = actions();
  api.signUp = async () => { throw new Error('Registration failed'); };
  await assert.rejects(performAuthEntry('adult',fields,api),/Registration failed/);
  assert.deepEqual(api.calls,[['save','ABCD1234'],['clear']]);
});
for (const mode of ['signup','adult']) test(`${mode} requires Terms/Privacy acceptance before any write`,async () => {
  const api=actions();
  await assert.rejects(performAuthEntry(mode,{ ...fields,legalAccepted:false },api),/Terms of Service/);
  assert.deepEqual(api.calls,[]);
});
test('adult invitation requires a code and never substitutes the child path',async () => {
  const api=actions();
  await assert.rejects(performAuthEntry('adult',{ ...fields,inviteCode:'' },api),/adult invitation code/);
  assert.deepEqual(api.calls,[]);
});
test('sign-in needs no invitation, display name, or registration checkbox', async () => {
  const api=actions();
  await performAuthEntry('signin',{ ...fields,displayName:'',inviteCode:'',legalAccepted:false },api);
  assert.deepEqual(api.calls,[['signin','adult@example.com','password123']]);
});
test('welcome defaults to role choices without registration tabs and keeps child fields separate',async () => {
  const source=await readFile(new URL('../src/screens/AuthScreen.tsx',import.meta.url),'utf8');
  assert.match(source,/useState<WelcomeScreenMode>\('welcome'\)/);
  assert.match(source,/I'm a Parent or Adult/);
  assert.match(source,/I'm a Child/);
  assert.match(source,/Enter Family Code/);
  assert.doesNotMatch(source,/Create Child Account|Create cloud account|styles\.tabs\}/);
  assert.match(source,/const requiresLegalAcceptance = screen === 'signup' \|\| screen === 'adult'/);
  assert.match(source,/screen === 'child' \? <>[\s\S]*Family code[\s\S]*<\/\> : <>/);
  assert.match(source,/if \(running.current \|\| !isForm\) return/);
});
