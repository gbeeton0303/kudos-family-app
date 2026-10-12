import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { cloudStorageKeys, createCloudSessionScope, CloudSessionChangedError } from '../src/cloud/cloudStorageScope.ts';
import { readAllPages } from '../src/cloud/pagination.ts';
import * as familyData from '../src/data/familyData.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
async function loadModule(path, stubs, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: (name) => {
    assert.ok(name in stubs, `Unexpected dependency ${name}`);
    return stubs[name];
  }, AbortController, fetch, setTimeout, clearTimeout, setInterval, clearInterval, console, ...globals });
  return module.exports;
}
const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(setImmediate); };
const profile = { id: 'p', name: 'Alex', avatar: { type: 'preset', key: 'boy1' }, colorKey: 'teal', pattern: 'solid', currencyType: 'coins', storageType: 'glassJar', startingBalance: 0, createdAt: '2026-10-01T00:00:00Z' };
const task = { id: 't', title: 'Read', amount: 5, frequency: 'daily', icon: { type: 'preset', value: '✓' }, assignedProfileIds: ['p'], completionEvents: {}, createdAt: profile.createdAt };
const reward = { id: 'r', title: 'Movie', cost: 25, icon: { type: 'preset', value: '✓' }, assignedProfileIds: ['p'], redemptionEvents: {}, createdAt: profile.createdAt };
const snapshot = () => ({ profiles: [profile], tasks: [task], rewards: [reward], completionRequests: [], rewardDeliveries: [] });

async function hookHarness(userId, storage, execute = async () => { throw Error('Network offline'); }) {
  let session = { user: { id: userId }, access_token: `${userId}-token` };
  const effects = [], callbacks = [], writes = [], stateUpdates = [];
  const channel = { on() { return channel; }, subscribe() {} };
  const client = { auth: {
    onAuthStateChange(callback) { callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session }, error: null }; },
  }, channel: () => channel, removeChannel: async () => {} };
  const module = await loadModule('../src/hooks/useCloudFamilyData.ts', {
    react: {
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, (value) => stateUpdates.push(value)],
      useRef: (value) => ({ current: value }), useMemo: (factory) => factory(), useCallback: (fn) => fn,
      useEffect: (effect) => effects.push(effect),
    },
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => { writes.push(key); storage.set(key, value); },
      multiRemove: async (keys) => keys.forEach((key) => storage.delete(key)),
    },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '../cloud/AuthContext': { useAuth: () => ({ user: session.user }) },
    '../cloud/cloudStorageScope': { cloudStorageKeys, createCloudSessionScope },
    '../cloud/supabase': { requireSupabase: () => client, createScopedCloudClient: (captured, scope) => ({ userId: captured.user.id, scope }) },
    '../cloud/retryCloudRead': { retryCloudRead: (read) => read() },
    '../data/familyData': familyData,
    '../cloud/repository': { executeCloudMutation: execute, fetchCloudFamilyState: async () => { throw Error('Network offline'); } },
  });
  const controller = module.useCloudFamilyData('workspace');
  const cleanups = effects.map((effect) => effect());
  await settle();
  return { controller, writes, stateUpdates,
    switchUser(id) { session = id ? { user: { id }, access_token: `${id}-token` } : null; callbacks.forEach((callback) => callback('SIGNED_IN', session)); },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

test('account and workspace keys isolate adults, children, queues, failures, and old unattributed caches', async () => {
  const keys = cloudStorageKeys('adult', 'workspace');
  assert.notDeepEqual(keys, cloudStorageKeys('child', 'workspace'));
  assert.notDeepEqual(keys, cloudStorageKeys('adult', 'other-workspace'));
  const storage = new Map([
    [keys.cache, JSON.stringify(snapshot())],
    [keys.queue, JSON.stringify([{ id: 'old', type: 'delete_profile', payload: { profileId: 'p' } }])],
    ['@brightsteps/cloud-cache-v1/workspace', JSON.stringify(snapshot())],
    ['@brightsteps/cloud-queue-v1/workspace', JSON.stringify([{ id: 'legacy' }])],
  ]);
  let executions = 0;
  const child = await hookHarness('child', storage, async () => { executions++; });
  assert.equal(executions, 0);
  assert.equal(child.stateUpdates.some((value) => value?.profiles?.some((p) => p.id === 'p')), false);
  assert.equal(child.writes.some((key) => key.includes('/adult/')), false);
  assert.ok(storage.has('@brightsteps/cloud-queue-v1/workspace'), 'unattributed old changes must not be deleted');
  child.unmount();
});

test('profile, preference, task, and reward edits enqueue even when React state updates are deferred', async () => {
  const keys = cloudStorageKeys('adult', 'workspace');
  const storage = new Map([[keys.cache, JSON.stringify(snapshot())]]);
  const harness = await hookHarness('adult', storage);
  // The fake React scheduler records state updates but never executes them.
  const api = harness.controller;
  api.updateProfile('p', { ...profile, name: 'New name' });
  api.updateOwnProfilePreferences('p', { ...profile, colorKey: 'gold' });
  api.updateTask('t', { ...task, title: 'New task', amount: 9 });
  api.updateReward('r', { ...reward, title: 'First edit', cost: 30 });
  api.updateReward('r', { ...reward, title: 'Second edit', cost: 40 });
  await settle();
  const queue = JSON.parse(storage.get(keys.queue));
  assert.deepEqual(queue.map((change) => change.type), ['update_profile', 'update_child_preferences', 'update_task', 'update_reward', 'update_reward']);
  assert.equal(queue[1].payload.profile.name, 'New name', 'a rapid preference edit must keep the preceding rename');
  assert.equal(queue[2].payload.task.amount, 9);
  const cache = JSON.parse(storage.get(keys.cache));
  assert.equal(cache.rewards[0].title, 'Second edit');
  assert.equal(cache.rewards[0].cost, 40);
  api.updateTask('missing', task);
  await settle();
  assert.equal(JSON.parse(storage.get(keys.queue)).length, 5);
  harness.unmount();
});

test('account changes stop an in-flight queue and keep unapplied work for its original adult', async () => {
  const keys = cloudStorageKeys('adult', 'workspace');
  const storage = new Map([[keys.cache, JSON.stringify(snapshot())]]);
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const executions = [];
  const harness = await hookHarness('adult', storage, async (_workspace, change, captured) => { executions.push([change.id, captured.userId]); await gate; });
  harness.controller.updateReward('r', { ...reward, cost: 30 });
  harness.controller.updateReward('r', { ...reward, cost: 40 });
  await settle();
  assert.equal(executions.length, 1);
  harness.switchUser('child');
  finish();
  await settle();
  assert.equal(executions.length, 1);
  assert.equal(executions[0][1], 'adult');
  assert.equal(JSON.parse(storage.get(keys.queue)).length, 2);
  assert.equal(storage.has(cloudStorageKeys('child', 'workspace').queue), false);
  harness.unmount();
});

test('a scoped client pins its bearer token and aborts further requests after account change', async () => {
  const configs = [];
  const calls = [];
  const module = await loadModule('../src/cloud/supabase.ts', {
    '@react-native-async-storage/async-storage': {},
    '@supabase/supabase-js': { createClient: (_url, _key, options) => { configs.push(options); return {}; } },
    'react-native-url-polyfill/auto': {},
  }, { process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable' } }, fetch: async (...args) => { calls.push(args); return {}; } });
  const scope = createCloudSessionScope('adult');
  module.createScopedCloudClient({ access_token: 'adult-token' }, scope);
  const config = configs.at(-1);
  assert.equal(config.global.headers.Authorization, 'Bearer adult-token');
  assert.equal(config.auth.persistSession, false);
  await config.global.fetch('https://example.supabase.co/rest/v1/tasks');
  scope.observeUser('child');
  assert.equal(calls[0][1].signal.aborted, true);
  assert.throws(() => config.global.fetch('https://example.supabase.co/rest/v1/tasks'), CloudSessionChangedError);
  scope.observeUser('adult');
  assert.equal(scope.isActive(), false, 'a stopped session cannot be revived by another event');
});

test('pagination loads all rows beyond 1,000, including smaller custom server limits', async () => {
  for (const limit of [100, 500]) {
    const records = Array.from({ length: 2501 }, (_, id) => ({ id }));
    const ranges = [];
    const result = await readAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: records.slice(from, Math.min(to + 1, from + limit)), count: records.length, error: null };
    });
    assert.deepEqual(result.data, records);
    assert.ok(ranges.length > 2);
  }
});
test('repository hydration preserves more than 1,000 completions and their historical point values', async () => {
  const rows = {
    child_profiles: [{ id: 'p', name: 'Alex', avatar_type: 'preset', avatar_value: 'boy1', color_key: 'teal', pattern: 'solid', currency_type: 'coins', storage_type: 'glassJar', starting_balance: 0, created_at: profile.createdAt }],
    task_templates: [{ id: 't', title: 'Read', amount: 99, frequency: 'unlimited', icon_type: 'preset', icon_value: '✓', created_at: profile.createdAt }],
    task_assignments: [{ task_id: 't', profile_id: 'p' }],
    task_completions: Array.from({ length: 1201 }, (_, i) => ({ id: `c${i}`, task_id: 't', profile_id: 'p', completed_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), period_key: `event-${i}` })),
    currency_ledger: Array.from({ length: 1201 }, (_, i) => ({ id: `l${i}`, profile_id: 'p', source_id: `c${i}`, amount: 5, transaction_type: 'task_completion', created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() })),
  };
  const requests = [];
  const client = { from(table) {
    const query = { select() { return query; }, eq(column, value) { assert.equal(column, 'workspace_id'); assert.equal(value, 'workspace'); return query; }, order() { return query; },
      async range(from, to) { requests.push([table, from, to]); const data = rows[table] ?? []; return { data: data.slice(from, Math.min(to + 1, from + 100)), count: data.length, error: null }; } };
    return query;
  } };
  const repository = await loadModule('../src/cloud/repository.ts', {
    '../data/familyData': familyData,
    './media': { signMediaPaths: async () => new Map() },
    './supabase': { requireSupabase() { throw Error('Must use scoped client'); } },
    './pagination': { readAllPages },
  });
  const state = await repository.fetchCloudFamilyState('workspace', client);
  assert.equal(state.tasks[0].completionEvents.p.length, 1201);
  assert.equal(state.tasks[0].completionAmounts.p.length, 1201);
  assert.equal(state.tasks[0].completionAmounts.p.reduce((sum, value) => sum + value, 0), 6005);
  assert.ok(requests.some(([table, from]) => table === 'currency_ledger' && from > 1000));
});

test('pagination rejects partial results when a later request fails or reports missing rows', async () => {
  await assert.rejects(readAllPages(async (from) => ({ data: from ? null : [{ id: 1 }], count: 2, error: from ? Error('offline') : null })), /offline/);
  await assert.rejects(readAllPages(async () => ({ data: [], count: 2, error: null })), /changed while loading/);
  assert.equal((await readAllPages(async () => ({ data: [], count: 0, error: null }))).data.length, 0);
});

test('normal redemption never retries as early; explicit early redemption retains authorization', async () => {
  const repository = await loadModule('../src/cloud/repository.ts', {
    '../data/familyData': familyData, './media': {}, './supabase': {}, './pagination': { readAllPages },
  });
  for (const allowEarly of [false, true]) {
    const calls = [];
    const client = { rpc: async (name, args) => {
      calls.push(args);
      return allowEarly ? { data: {}, error: null } : { data: null, error: { message: 'insufficient balance' } };
    } };
    const mutation = { id: 'm', type: 'redeem_reward', payload: { redemptionId: 'r', deliveryId: 'd', rewardId: 'reward', profileId: 'p', deliverToChild: false, redeemedAt: profile.createdAt, allowEarly } };
    if (allowEarly) await repository.executeCloudMutation('workspace', mutation, client);
    else await assert.rejects(repository.executeCloudMutation('workspace', mutation, client), error => error.message === 'insufficient balance');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].p_allow_early, allowEarly);
  }
});

test('client balance uses accounting time while keeping backdated redemption history for display', () => {
  const p={...profile,startingBalance:0};
  const earned={...task,completionEvents:{p:['2026-10-10T12:00:00Z']},completionAmounts:{p:[25]}};
  const spent={...reward,redemptionEvents:{p:['2026-10-09T12:00:00Z']},redemptionAccountingEvents:{p:['2026-10-11T12:00:00Z']},redemptionCosts:{p:[25]}};
  assert.equal(familyData.getProfileBalance(p,[earned],[spent]),0);
  const saved=familyData.normalizeFamilyState({profiles:[p],tasks:[earned],rewards:[spent],completionRequests:[],rewardDeliveries:[]});
  assert.equal(saved.rewards[0].redemptionEvents.p[0],'2026-10-09T12:00:00Z');
  assert.equal(familyData.getProfileBalance(saved.profiles[0],saved.tasks,saved.rewards),0);
});

test('all eleven workspace reads use pagination with stable ordering, and every mutation forwards its scoped client', async () => {
  const source = await readFile(new URL('../src/cloud/repository.ts', import.meta.url), 'utf8');
  const reads = source.slice(source.indexOf('] = await Promise.all(['), source.indexOf('const failure'));
  assert.equal((reads.match(/readWorkspaceTable\(client, workspaceId/g) ?? []).length, 11);
  assert.match(source, /select\(columns, \{ count: 'exact' \}\)/);
  assert.match(source, /table\.endsWith\('_assignments'\) \? 'profile_id' : 'id'/);
  const dispatch = source.slice(source.indexOf('export async function executeCloudMutation'), source.indexOf('export function emptyFamilyState'));
  for (const call of dispatch.matchAll(/return \w+\(([^;]*)\);/g)) assert.ok(call[1].endsWith(', client'));
});
