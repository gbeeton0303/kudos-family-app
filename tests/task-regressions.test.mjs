import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  archiveTask,
  canCompleteTask,
  getProfileBalance,
  getTaskPeriodKey,
  hasTaskCompletionForPeriod,
  recordTaskCompletion,
  removeTaskCompletion,
  toDateKey,
} from '../src/data/familyData.ts';

function dailyTask(overrides = {}) {
  return {
    id: 'task-daily',
    title: 'Daily task',
    amount: 5,
    frequency: 'daily',
    icon: { type: 'preset', value: '✓' },
    assignedProfileIds: ['profile-a', 'profile-b'],
    completionEvents: {},
    completionPeriods: {},
    createdAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

test('daily task can be completed only once in the same local day', () => {
  const first = new Date(2026, 7, 27, 9, 15).toISOString();
  const duplicate = new Date(2026, 7, 27, 18, 45).toISOString();
  const completed = recordTaskCompletion(dailyTask(), 'profile-a', first);

  assert.equal(canCompleteTask(completed, 'profile-a', new Date(duplicate)), false);
  assert.equal(recordTaskCompletion(completed, 'profile-a', duplicate), completed);
  assert.deepEqual(completed.completionEvents['profile-a'], [first]);
});

test('an explicitly confirmed manager repeat adds a second daily award without reopening the task', () => {
  const first = new Date(2026, 7, 27, 9, 15).toISOString();
  const repeatedAt = new Date(2026, 7, 27, 18, 45).toISOString();
  const completed = recordTaskCompletion(dailyTask(), 'profile-a', first);
  const repeated = recordTaskCompletion(completed, 'profile-a', repeatedAt, false, true);

  assert.deepEqual(repeated.completionEvents['profile-a'], [first, repeatedAt]);
  assert.deepEqual(repeated.completionPeriods['profile-a'], [getTaskPeriodKey('daily', new Date(first))]);
  assert.equal(canCompleteTask(repeated, 'profile-a', new Date(repeatedAt)), false);
});

test('repeat override never bypasses the period lock for non-daily tasks', () => {
  const first = new Date(2026, 7, 27, 9, 15).toISOString();
  const duplicate = new Date(2026, 7, 27, 18, 45).toISOString();
  const weekly = dailyTask({ frequency: 'weekly', scheduleDays: [new Date(first).getDay()] });
  const completed = recordTaskCompletion(weekly, 'profile-a', first);

  assert.equal(recordTaskCompletion(completed, 'profile-a', duplicate, false, true), completed);
});

test('an approved child request records its period and blocks duplicate taps', () => {
  const requestedAt = new Date(2026, 7, 27, 16, 30).toISOString();
  const approved = recordTaskCompletion(dailyTask(), 'profile-a', requestedAt);

  assert.equal(hasTaskCompletionForPeriod(approved, 'profile-a', new Date(requestedAt)), true);
  assert.deepEqual(approved.completionPeriods['profile-a'], [getTaskPeriodKey('daily', new Date(requestedAt))]);
  assert.equal(canCompleteTask(approved, 'profile-a', new Date(requestedAt)), false);
});

test('undo removes the approved completion and makes that daily task available again', () => {
  const occurredAt = new Date(2026, 7, 27, 12).toISOString();
  const completed = recordTaskCompletion(dailyTask(), 'profile-a', occurredAt);
  const undone = removeTaskCompletion(completed, 'profile-a', occurredAt);

  assert.deepEqual(undone.completionEvents['profile-a'], []);
  assert.deepEqual(undone.completionPeriods['profile-a'], []);
  assert.equal(canCompleteTask(undone, 'profile-a', new Date(occurredAt)), true);
});

test('local midnight creates a new daily period without relying on UTC date casts', () => {
  const beforeMidnight = new Date(2026, 7, 27, 23, 59, 59);
  const afterMidnight = new Date(2026, 7, 28, 0, 0, 1);

  assert.equal(toDateKey(beforeMidnight), '2026-08-27');
  assert.equal(toDateKey(afterMidnight), '2026-08-28');
  assert.notEqual(getTaskPeriodKey('daily', beforeMidnight), getTaskPeriodKey('daily', afterMidnight));
});

test('daily periods roll over at local midnight in representative time zones', () => {
  const moduleUrl = new URL('../src/data/familyData.ts', import.meta.url).href;
  const probe = `import { getTaskPeriodKey } from ${JSON.stringify(moduleUrl)}; const a = new Date(2026, 7, 27, 23, 59, 59); const b = new Date(2026, 7, 28, 0, 0, 1); process.stdout.write(JSON.stringify([getTaskPeriodKey('daily', a), getTaskPeriodKey('daily', b)]));`;
  for (const timeZone of ['America/New_York', 'Pacific/Honolulu', 'Asia/Tokyo']) {
    const output = execFileSync(process.execPath, ['--no-warnings', '--experimental-strip-types', '--input-type=module', '-e', probe], {
      encoding: 'utf8',
      env: { ...process.env, TZ: timeZone },
    });
    const [before, after] = JSON.parse(output);
    assert.notEqual(before, after, `${timeZone} should roll over at its local midnight`);
  }
});

test('completion state is isolated across multiple child profiles', () => {
  const occurredAt = new Date(2026, 7, 27, 10).toISOString();
  const completedForA = recordTaskCompletion(dailyTask(), 'profile-a', occurredAt);

  assert.equal(canCompleteTask(completedForA, 'profile-a', new Date(occurredAt)), false);
  assert.equal(canCompleteTask(completedForA, 'profile-b', new Date(occurredAt)), true);
  assert.equal(completedForA.completionEvents['profile-b'], undefined);
});

test('unlimited tasks remain repeatable while preserving distinct completion events', () => {
  const task = dailyTask({ frequency: 'unlimited' });
  const first = recordTaskCompletion(task, 'profile-a', new Date(2026, 7, 27, 10).toISOString());
  const second = recordTaskCompletion(first, 'profile-a', new Date(2026, 7, 27, 10, 1).toISOString());

  assert.equal(second.completionEvents['profile-a'].length, 2);
  assert.equal(canCompleteTask(second, 'profile-a'), true);
});

test('removing a task assignment preserves the child completion value', () => {
  const occurredAt = new Date(2026, 8, 9, 10).toISOString();
  const completed = recordTaskCompletion(dailyTask(), 'profile-a', occurredAt);
  const unassigned = { ...completed, assignedProfileIds: completed.assignedProfileIds.filter((id) => id !== 'profile-a') };
  const profile = { id: 'profile-a', startingBalance: 0, balanceResetEvents: [] };

  assert.equal(getProfileBalance(profile, [completed], []), 5);
  assert.equal(getProfileBalance(profile, [unassigned], []), 5);
  assert.deepEqual(unassigned.completionEvents['profile-a'], [occurredAt]);
});

test('archiving a library task hides assignments but preserves history and balance', () => {
  const occurredAt = new Date(2026, 8, 9, 11).toISOString();
  const completed = recordTaskCompletion(dailyTask(), 'profile-a', occurredAt);
  const archived = archiveTask(completed, '2026-09-09T12:00:00.000Z');
  const profile = { id: 'profile-a', startingBalance: 3, balanceResetEvents: [] };

  assert.deepEqual(archived.assignedProfileIds, []);
  assert.equal(archived.archivedAt, '2026-09-09T12:00:00.000Z');
  assert.deepEqual(archived.completionEvents['profile-a'], [occurredAt]);
  assert.equal(getProfileBalance(profile, [archived], []), 8);
});

test('editing a task value does not rewrite points awarded by older completions', () => {
  const firstAt = '2026-09-01T14:00:00.000Z';
  const secondAt = '2026-09-02T14:00:00.000Z';
  const firstCompletion = recordTaskCompletion(dailyTask({ amount: 5 }), 'profile-a', firstAt);
  const editedTask = { ...firstCompletion, amount: 20 };
  const secondCompletion = recordTaskCompletion(editedTask, 'profile-a', secondAt);
  const profile = { id: 'profile-a', startingBalance: 0, balanceResetEvents: [] };

  assert.deepEqual(secondCompletion.completionAmounts['profile-a'], [5, 20]);
  assert.equal(getProfileBalance(profile, [secondCompletion], []), 25);
});

test('cloud completion amounts remain authoritative when the task value changes', () => {
  const task = dailyTask({
    amount: 20,
    completionEvents: { 'profile-a': ['2026-09-01T14:00:00.000Z'] },
    completionAmounts: { 'profile-a': [5] },
  });
  const profile = { id: 'profile-a', startingBalance: 0, balanceResetEvents: [] };

  assert.equal(getProfileBalance(profile, [task], []), 5);
});

test('undo removes the matching historical award amount', () => {
  const firstAt = '2026-09-01T14:00:00.000Z';
  const secondAt = '2026-09-02T14:00:00.000Z';
  const firstCompletion = recordTaskCompletion(dailyTask({ amount: 5 }), 'profile-a', firstAt);
  const secondCompletion = recordTaskCompletion({ ...firstCompletion, amount: 20 }, 'profile-a', secondAt);
  const undone = removeTaskCompletion(secondCompletion, 'profile-a', secondAt);

  assert.deepEqual(undone.completionEvents['profile-a'], [firstAt]);
  assert.deepEqual(undone.completionAmounts['profile-a'], [5]);
});

test('unassigning a redeemed reward preserves the historical points spent', () => {
  const profile = { id: 'profile-a', startingBalance: 20, balanceResetEvents: [] };
  const redeemed = {
    id: 'reward-a', title: 'Movie', cost: 10, icon: { type: 'preset', value: '🎬' },
    assignedProfileIds: ['profile-a'], redemptionEvents: { 'profile-a': ['2026-09-01T18:00:00.000Z'] },
    redemptionCosts: { 'profile-a': [10] }, createdAt: '2026-09-01T12:00:00.000Z',
  };
  const unassigned = { ...redeemed, assignedProfileIds: [] };

  assert.equal(getProfileBalance(profile, [], [redeemed]), 10);
  assert.equal(getProfileBalance(profile, [], [unassigned]), 10);
});

test('an archived reward remains in balance history without being assigned', () => {
  const profile = { id: 'profile-a', startingBalance: 20, balanceResetEvents: [] };
  const archived = {
    id: 'reward-a', title: 'Movie', cost: 10, icon: { type: 'preset', value: '🎬' },
    assignedProfileIds: [], redemptionEvents: { 'profile-a': ['2026-09-01T18:00:00.000Z'] },
    redemptionCosts: { 'profile-a': [10] }, createdAt: '2026-09-01T12:00:00.000Z', archivedAt: '2026-09-02T12:00:00.000Z',
  };

  assert.equal(getProfileBalance(profile, [], [archived]), 10);
});
