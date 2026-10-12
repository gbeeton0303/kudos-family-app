import assert from 'node:assert/strict';
import test from 'node:test';
import { createMigrationHandler } from '../supabase/functions/migrate-local-data/handler.ts';
import { createRewardHandler } from '../supabase/functions/reward-action/handler.ts';
import { importId, remapImportState, writeImportPlan } from '../supabase/functions/_shared/import-security.ts';

// Execute the real request handlers against an isolated database double. It
// implements conflicts and query filters, and records every write/push.
function database(seed = {}) {
  const tables = structuredClone(seed);
  const writes = [];
  const reads = [];
  const db = {
    tables, writes, reads, beforeWrite: null, readError: null,
    async rpc(name, args) {
      assert.equal(name, 'commit_local_import');
      const marker = (tables.migration_imports ?? []).find(row => row.workspace_id === args.p_workspace_id && row.user_id === args.p_user_id);
      if (marker) {
        if (marker.payload_hash && marker.payload_hash !== args.p_payload_hash) return { error: Error('A different import has already completed') };
        return { data: { imported: true, alreadyImported: true }, error: null };
      }
      const snapshot = structuredClone(tables), length = writes.length;
      try {
        await writeImportPlan(db, args.p_workspace_id, args.p_writes);
        (tables.migration_imports ??= []).push({ workspace_id: args.p_workspace_id, user_id: args.p_user_id, payload_hash: args.p_payload_hash });
        return { data: { imported: true }, error: null };
      } catch (error) {
        for (const key of Object.keys(tables)) delete tables[key];
        Object.assign(tables, snapshot); writes.length = length;
        return { data: null, error };
      }
    },
    from(table) {
      let operation = 'select', payload, options = {}, single = false;
      const predicates = [];
      const query = {
        select() { return query; },
        eq(key, value) { predicates.push((row) => row[key] === value); return query; },
        in(key, values) { predicates.push((row) => values.includes(row[key])); return query; },
        maybeSingle() { single = true; return query; },
        insert(value) { operation = 'insert'; payload = value; return query; },
        upsert(value, opts) { operation = 'upsert'; payload = value; options = opts; return query; },
        async then(resolve, reject) {
          try {
            const rows = tables[table] ??= [];
            if (operation === 'select') {
              reads.push(table);
              if (db.readError === table) return resolve({ data: null, error: { message: 'Database unavailable' } });
              const matches = rows.filter((row) => predicates.every((filter) => filter(row)));
              return resolve({ data: single ? matches[0] ?? null : matches.slice(0, 1000), error: null });
            }
            db.beforeWrite?.(table, payload);
            const keys = (options.onConflict ?? 'id').split(',');
            for (const row of Array.isArray(payload) ? payload : [payload]) {
              const existing = rows.find((candidate) => keys.every((key) => candidate[key] === row[key]));
              if (existing && operation === 'insert') return resolve({ data: null, error: { code: '23505', message: 'Duplicate ID' } });
              if (!existing) rows.push(structuredClone(row));
              else if (!options.ignoreDuplicates) Object.assign(existing, structuredClone(row));
              writes.push({ table, row: structuredClone(row), options });
            }
            return resolve({ data: null, error: null });
          } catch (error) { return reject(error); }
        },
      };
      return query;
    },
  };
  return db;
}

const member = (workspace_id = 'family-a', user_id = 'adult-a', role = 'parent') => ({ workspace_id, user_id, role });
const profile = (id = 'profile-a', workspace_id = 'family-a') => ({ id, workspace_id, linked_user_id: 'child-a' });
const delivery = (profile_id = 'profile-a', workspace_id = 'family-a') => ({ id: 'delivery-a', profile_id, workspace_id });
const request = (body) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });

function rewardEndpoint(db, userId = 'adult-a', rpc = async () => ({ data: {}, error: null })) {
  const pushes = [];
  const handler = createRewardHandler({
    requireUser: async () => ({ user: { id: userId }, client: { rpc } }),
    serviceClient: () => db,
    sendExpoPush: async (messages) => { pushes.push(...messages); },
  });
  return { pushes, call: (body) => handler(request(body)) };
}

function migrationEndpoint(db, userId = 'adult-a') {
  return (body) => createMigrationHandler({
    requireUser: async () => ({ user: { id: userId } }), serviceClient: () => db,
  })(request(body));
}

const rewardBody = { action: 'redeem', workspaceId: 'family-a', rewardId: 'reward-a', profileId: 'profile-a',
  deliverToChild: false, reward: { id: 'reward-a', title: 'Movie', cost: 10, icon: { type: 'preset', value: 'movie' } } };

for (const role of ['parent', 'teacher']) {
  test(`${role} can notify only the committed delivery's child/workspace`, async () => {
    const db = database({ workspace_members: [member('family-a', 'adult-a', role)],
      child_profiles: [profile()], reward_deliveries: [delivery()], device_tokens: [
        { user_id: 'child-a', workspace_id: 'family-a', expo_push_token: 'token-a' },
        { user_id: 'child-a', workspace_id: 'family-b', expo_push_token: 'token-b' },
      ] });
    const endpoint = rewardEndpoint(db);
    assert.equal((await endpoint.call({ action: 'notify', profileId: 'profile-a', deliveryId: 'delivery-a' })).status, 200);
    assert.deepEqual(endpoint.pushes.map((push) => push.to), ['token-a']);
  });
}

for (const scenario of ['unrelated adult', 'child', 'missing delivery', 'mismatched child', 'foreign profile', 'membership error']) {
  test(`notification rejects ${scenario} before looking up tokens or sending push`, async () => {
    const db = database({ workspace_members: [member()], child_profiles: [profile()], reward_deliveries: [delivery()] });
    let userId = 'adult-a', profileId = 'profile-a';
    if (scenario === 'unrelated adult') userId = 'adult-b';
    if (scenario === 'child') db.tables.workspace_members[0].role = 'child';
    if (scenario === 'missing delivery') db.tables.reward_deliveries = [];
    if (scenario === 'mismatched child') profileId = 'other-child';
    if (scenario === 'foreign profile') db.tables.child_profiles[0].workspace_id = 'family-b';
    if (scenario === 'membership error') db.readError = 'workspace_members';
    const endpoint = rewardEndpoint(db, userId);
    assert.equal((await endpoint.call({ action: 'notify', profileId, deliveryId: 'delivery-a' })).status, 400);
    assert.equal(endpoint.pushes.length, 0);
    assert.ok(!db.reads.includes('device_tokens'));
    assert.equal(db.writes.length, 0);
  });
}

for (const scenario of ['foreign reward', 'foreign profile', 'non-manager']) {
  test(`reward repair rejects ${scenario} without privileged writes`, async () => {
    const db = database({ workspace_members: [member()], child_profiles: [profile()],
      reward_templates: [{ id: 'reward-a', workspace_id: scenario === 'foreign reward' ? 'family-b' : 'family-a', cost: 30 }] });
    if (scenario === 'foreign profile') db.tables.child_profiles[0].workspace_id = 'family-b';
    const endpoint = rewardEndpoint(db, scenario === 'non-manager' ? 'adult-b' : 'adult-a',
      async () => ({ error: { message: 'Reward not assigned' } }));
    const before = structuredClone(db.tables);
    assert.equal((await endpoint.call(rewardBody)).status, 400);
    assert.equal(db.writes.length, 0);
    assert.deepEqual(db.tables, before);
  });
}

test('assignment repair preserves the existing reward price and title', async () => {
  const db = database({ workspace_members: [member()], child_profiles: [profile()],
    reward_templates: [{ id: 'reward-a', workspace_id: 'family-a', title: 'Original', cost: 30 }] });
  let calls = 0;
  const endpoint = rewardEndpoint(db, 'adult-a', async () => ++calls === 1
    ? { error: { message: 'Reward not assigned' } } : { data: { redeemed: true }, error: null });
  assert.equal((await endpoint.call(rewardBody)).status, 200);
  assert.equal(calls, 2);
  assert.equal(db.tables.reward_templates[0].cost, 30);
  assert.equal(db.tables.reward_templates[0].title, 'Original');
  assert.deepEqual(db.writes.map((write) => write.table), ['reward_assignments']);
});

test('a missing local reward can still be inserted and redeemed in its own workspace', async () => {
  const db = database({ workspace_members: [member()], child_profiles: [profile()] });
  let calls = 0;
  const endpoint = rewardEndpoint(db, 'adult-a', async () => ++calls === 1
    ? { error: { message: 'Reward not found' } } : { data: { redeemed: true }, error: null });
  assert.equal((await endpoint.call(rewardBody)).status, 200);
  assert.equal(db.tables.reward_templates[0].workspace_id, 'family-a');
  assert.equal(db.tables.reward_assignments[0].profile_id, 'profile-a');
});

test('a foreign reward inserted during repair cannot be overwritten', async () => {
  const db = database({ workspace_members: [member()], child_profiles: [profile()] });
  db.beforeWrite = (table) => {
    if (table === 'reward_templates') db.tables.reward_templates.push({ id: 'reward-a', workspace_id: 'family-b', cost: 50 });
  };
  const endpoint = rewardEndpoint(db, 'adult-a', async () => ({ error: { message: 'Reward not found' } }));
  assert.equal((await endpoint.call(rewardBody)).status, 400);
  assert.equal(db.tables.reward_templates[0].workspace_id, 'family-b');
  assert.equal(db.tables.reward_templates[0].cost, 50);
  assert.equal(db.writes.length, 0);
});

test('insufficient balance does not invoke template or assignment repair', async () => {
  const db = database();
  const endpoint = rewardEndpoint(db, 'adult-a', async () => ({ error: { message: 'Insufficient balance' } }));
  assert.equal((await endpoint.call(rewardBody)).status, 400);
  assert.equal(db.reads.length, 0);
  assert.equal(db.writes.length, 0);
});

test('a successful redemption with a valid delivery still sends its notification', async () => {
  const db = database({ workspace_members: [member()], child_profiles: [profile()], reward_deliveries: [delivery()],
    device_tokens: [{ user_id: 'child-a', workspace_id: 'family-a', expo_push_token: 'token-a' }] });
  const endpoint = rewardEndpoint(db);
  assert.equal((await endpoint.call({ ...rewardBody, deliverToChild: true, deliveryId: 'delivery-a' })).status, 200);
  assert.equal(endpoint.pushes.length, 1);
  assert.equal(endpoint.pushes[0].data.deliveryId, 'delivery-a');
});

test('a committed redemption remains successful if its notification cannot be authorized', async () => {
  const endpoint = rewardEndpoint(database());
  const response = await endpoint.call({ ...rewardBody, deliverToChild: true, deliveryId: 'missing' });
  assert.equal(response.status, 200);
  assert.equal(endpoint.pushes.length, 0);
});

function localState() {
  const when = '2026-10-01T12:00:00.000Z';
  return {
    profiles: [{ id: 'local-p', name: 'Child', avatar: { type: 'preset', key: 'avatar' },
      colorKey: 'teal', currencyType: 'coins', storageType: 'piggyBank', createdAt: when }],
    tasks: [{ id: 'local-t', title: 'Read', amount: 5, frequency: 'daily', icon: { type: 'preset', value: 'book' },
      assignedProfileIds: ['local-p'], completionEvents: { 'local-p': [when] }, createdAt: when }],
    rewards: [{ id: 'local-r', title: 'Movie', cost: 5, icon: { type: 'preset', value: 'movie' },
      assignedProfileIds: ['local-p'], redemptionEvents: { 'local-p': [when] }, createdAt: when }],
    completionRequests: [{ id: 'local-request', taskId: 'local-t', profileId: 'local-p', requestedAt: when, status: 'approved' }],
    rewardDeliveries: [{ id: 'local-delivery', rewardId: 'local-r', profileId: 'local-p', rewardTitle: 'Movie',
      rewardIcon: { type: 'preset', value: 'movie' }, cost: 5, balanceBefore: 5, balanceAfter: 0, sentAt: when, status: 'waiting' }],
  };
}

test('import preserves saved earnings, actual early-redemption costs, reset boundaries and archive status', async () => {
  const state = localState();
  const first = '2026-10-01T12:00:00.000Z', second = '2026-10-02T12:00:00.000Z';
  state.tasks[0].amount = 99;
  state.tasks[0].completionEvents['local-p'] = [first, second];
  state.tasks[0].completionAmounts = { 'local-p': [5, 7] };
  state.tasks[0].archivedAt = second;
  state.tasks[0].assignedProfileIds = [];
  state.rewards[0].cost = 100;
  state.rewards[0].redemptionEvents['local-p'] = [first, second];
  state.rewards[0].redemptionCosts = { 'local-p': [3, 0] };
  state.profiles[0].balanceResetEvents = [first];
  const db = database({ workspace_members: [member()] });
  assert.equal((await migrationEndpoint(db)({ workspaceId: 'family-a', state })).status, 200);
  assert.deepEqual(db.tables.currency_ledger.filter(row => row.transaction_type === 'task_completion').map(row => row.amount), [5, 7]);
  assert.deepEqual(db.tables.reward_redemptions.map(row => row.cost), [3, 0]);
  assert.deepEqual(db.tables.currency_ledger.filter(row => row.transaction_type === 'reward_redemption').map(row => row.amount), [-3, -0]);
  assert.equal(db.tables.profile_balance_resets[0].reset_at, first);
  assert.equal(db.tables.profile_balance_resets[0].profile_id, db.tables.child_profiles[0].id);
  assert.equal(db.tables.task_templates[0].archived_at, second);
  assert.ok(db.tables.task_completions.every(completion => db.tables.currency_ledger.some(ledger => ledger.source_id === completion.id && ledger.transaction_type === 'task_completion')));
});

test('equal-timestamp imported events preserve separate awards and aligned historical amounts', async () => {
  const state = localState();
  const when = state.tasks[0].completionEvents['local-p'][0];
  state.tasks[0].completionEvents['local-p'] = [when, when];
  state.tasks[0].completionAmounts = { 'local-p': [5, 7] };
  const db = database({ workspace_members: [member()] });
  assert.equal((await migrationEndpoint(db)({ workspaceId: 'family-a', state })).status, 200);
  assert.equal(db.tables.task_completions.length, 2);
  assert.notEqual(db.tables.task_completions[0].period_key, db.tables.task_completions[1].period_key);
  assert.deepEqual(db.tables.currency_ledger.filter(row => row.transaction_type === 'task_completion').map(row => row.amount), [5, 7]);
});

for (const problem of ['negative award', 'misaligned costs', 'foreign amounts', 'invalid reset']) {
  test(`import rejects ${problem} before any writes`, async () => {
    const state = localState();
    if (problem === 'negative award') state.tasks[0].completionAmounts = { 'local-p': [-1] };
    if (problem === 'misaligned costs') state.rewards[0].redemptionCosts = { 'local-p': [1, 2] };
    if (problem === 'foreign amounts') state.tasks[0].completionAmounts = { 'foreign-p': [5] };
    if (problem === 'invalid reset') state.profiles[0].balanceResetEvents = ['not-a-date'];
    const db = database({ workspace_members: [member()] });
    assert.equal((await migrationEndpoint(db)({ workspaceId: 'family-a', state })).status, 400);
    assert.equal(db.writes.length, 0);
  });
}

test('import remaps every entity, history key, assignment, and reference by workspace', async () => {
  const source = localState();
  const a = await remapImportState('family-a', source);
  const b = await remapImportState('family-b', source);
  assert.notEqual(a.profiles[0].id, b.profiles[0].id);
  assert.notEqual(a.tasks[0].id, b.tasks[0].id);
  assert.notEqual(a.rewards[0].id, b.rewards[0].id);
  assert.notEqual(a.completionRequests[0].id, b.completionRequests[0].id);
  assert.notEqual(a.rewardDeliveries[0].id, b.rewardDeliveries[0].id);
  assert.equal(a.tasks[0].assignedProfileIds[0], a.profiles[0].id);
  assert.equal(Object.keys(a.tasks[0].completionEvents)[0], a.profiles[0].id);
  assert.equal(a.rewards[0].assignedProfileIds[0], a.profiles[0].id);
  assert.equal(a.completionRequests[0].taskId, a.tasks[0].id);
  assert.equal(a.rewardDeliveries[0].rewardId, a.rewards[0].id);
  assert.deepEqual(await remapImportState('family-a', source), a);
  assert.equal(source.profiles[0].id, 'local-p');
});

test('imports of the same local data into two workspaces leave foreign original IDs untouched', async () => {
  const db = database({ workspace_members: [member(), member('family-b')],
    child_profiles: [{ id: 'local-p', workspace_id: 'foreign', name: 'Untouched' }],
    task_templates: [{ id: 'local-t', workspace_id: 'foreign', amount: 100 }],
    reward_templates: [{ id: 'local-r', workspace_id: 'foreign', cost: 100 }] });
  const call = migrationEndpoint(db);
  for (const workspaceId of ['family-a', 'family-b']) {
    assert.equal((await call({ workspaceId, state: localState() })).status, 200);
  }
  assert.equal(db.tables.child_profiles[0].name, 'Untouched');
  assert.equal(db.tables.task_templates[0].amount, 100);
  assert.equal(db.tables.reward_templates[0].cost, 100);
  assert.equal(db.tables.currency_ledger.length, 4);
  for (const table of ['task_assignments', 'reward_assignments', 'task_completions', 'reward_redemptions', 'task_completion_requests', 'reward_deliveries']) {
    for (const row of db.tables[table]) {
      assert.equal(db.tables.child_profiles.find((p) => p.id === row.profile_id).workspace_id, row.workspace_id);
    }
  }
});

for (const location of ['assignment', 'completion history', 'redemption history', 'request', 'delivery']) {
  test(`import rejects foreign ${location} references before any writes`, async () => {
    const state = localState();
    if (location === 'assignment') state.tasks[0].assignedProfileIds = ['foreign-p'];
    if (location === 'completion history') state.tasks[0].completionEvents = { 'foreign-p': ['2026-10-01T12:00:00.000Z'] };
    if (location === 'redemption history') state.rewards[0].redemptionEvents = { 'foreign-p': ['2026-10-01T12:00:00.000Z'] };
    if (location === 'request') state.completionRequests[0].taskId = 'foreign-t';
    if (location === 'delivery') state.rewardDeliveries[0].rewardId = 'foreign-r';
    const db = database({ workspace_members: [member()] });
    assert.equal((await migrationEndpoint(db)({ workspaceId: 'family-a', state })).status, 400);
    assert.equal(db.writes.length, 0);
  });
}

test('a namespaced import collision in a later table fails before writing profiles', async () => {
  const state = localState();
  const mapped = await remapImportState('family-a', state);
  const db = database({ workspace_members: [member()], reward_deliveries: [
    { id: mapped.rewardDeliveries[0].id, workspace_id: 'family-b', profile_id: 'foreign-p' },
  ] });
  assert.equal((await migrationEndpoint(db)({ workspaceId: 'family-a', state })).status, 400);
  assert.equal(db.writes.length, 0);
});

test('legacy import markers prevent duplicate financial history after upgrade', async () => {
  const db = database({ workspace_members: [member()], migration_imports: [{ workspace_id: 'family-a', user_id: 'adult-a' }] });
  const response = await migrationEndpoint(db)({ workspaceId: 'family-a', state: localState() });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.alreadyImported, true);
  assert.equal(db.writes.length, 0);
});

test('retrying a completed import does not add more ledger entries', async () => {
  const db = database({ workspace_members: [member()] });
  const call = migrationEndpoint(db);
  assert.equal((await call({ workspaceId: 'family-a', state: localState() })).status, 200);
  const count = db.tables.currency_ledger.length;
  assert.equal((await call({ workspaceId: 'family-a', state: localState() })).status, 200);
  assert.equal(db.tables.currency_ledger.length, count);
});

test('children and unrelated adults cannot import data', async () => {
  for (const userId of ['child-a', 'adult-b']) {
    const db = database({ workspace_members: [member('family-a', 'child-a', 'child')] });
    assert.equal((await migrationEndpoint(db, userId)({ workspaceId: 'family-a', state: localState() })).status, 400);
    assert.equal(db.writes.length, 0);
  }
});

test('a concurrent foreign import ID collision is ignored then rejected without overwriting', async () => {
  const db = database();
  db.beforeWrite = (table, rows) => {
    db.tables[table].push({ id: rows[0].id, workspace_id: 'family-b', name: 'Untouched' });
  };
  await assert.rejects(writeImportPlan(db, 'family-a', [{ table: 'child_profiles', conflict: 'id',
    rows: [{ id: 'derived-id', workspace_id: 'family-a', name: 'Replacement' }] }]), /another workspace/);
  assert.equal(db.tables.child_profiles[0].name, 'Untouched');
});

test('import preflight validates more than the API row limit through bounded batches', async () => {
  const rows = Array.from({ length: 1101 }, (_, i) => ({ id: `p-${i}`, workspace_id: 'family-a' }));
  const existing = structuredClone(rows);
  existing[1100].workspace_id = 'family-b';
  const db = database({ child_profiles: existing });
  await assert.rejects(writeImportPlan(db, 'family-a', [{ table: 'child_profiles', conflict: 'id', rows }]), /another workspace/);
  assert.equal(db.writes.length, 0);
});

test('event identity hashing does not collapse punctuation or different component boundaries', async () => {
  assert.notEqual(await importId('family-a', 'completion', ['a-b', 'c', 'event']),
    await importId('family-a', 'completion', ['a', 'b-c', 'event']));
});
