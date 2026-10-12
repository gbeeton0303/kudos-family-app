import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { alternativeManagerWorkspaces } from '../src/cloud/workspaceNavigation.ts';

const access = (workspaceId, workspaceType, role) => ({workspaceId,workspaceType,role,workspaceName:workspaceId,linkedProfileId:null});
const family = access('inviting-family','family','parent');
const classroom = access('own-classroom','classroom','teacher');
test('invited adult can return from their classroom paywall to the exact joined family', () => {
  assert.deepEqual(alternativeManagerWorkspaces(classroom,[family,classroom]),[family]);
});
test('workspace switcher preserves exact IDs when several workspaces have the same type', () => {
  const other = access('another-family','family','parent');
  assert.deepEqual(alternativeManagerWorkspaces(classroom,[family,other,classroom]).map(item => item.workspaceId),['inviting-family','another-family']);
});
test('child login never receives workspace switching and adults do not switch into child membership', () => {
  const child = access('child-space','family','child');
  assert.deepEqual(alternativeManagerWorkspaces(child,[child,family,classroom]),[]);
  assert.deepEqual(alternativeManagerWorkspaces(classroom,[child,family,classroom]),[family]);
});
test('every blocked-access and upgrade route passes navigation and deletion callbacks', async () => {
  const source = await readFile(new URL('../App.tsx',import.meta.url),'utf8');
  const routes = source.split('\n').filter(line => line.includes('return <PurchaseAccessScreen') || line.includes('return <WorkspaceAccessPausedScreen'));
  assert.equal(routes.length,4);
  for (const route of routes) {
    assert.match(route,/workspaces=\{accessList\}/);
    assert.match(route,/onWorkspaceSelect=\{onWorkspaceSelect\}/);
    assert.match(route,/onWorkspaceRefresh=\{onWorkspaceRefresh\}/);
  }
});
test('entire-account preview/deletion cannot trigger a legacy selected-workspace delete', async () => {
  const source = await readFile(new URL('../src/cloud/accountActions.ts',import.meta.url),'utf8');
  const entire = source.slice(source.indexOf('export async function previewEntireAccountDeletion'));
  assert.doesNotMatch(entire,/workspaceId:\s*access\.workspaceId/);
  assert.match(entire,/scope !== 'account-preview'/);
  assert.match(entire,/scope !== 'account'/);
});
