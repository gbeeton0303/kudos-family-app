import { requiredId } from './workspace-security.ts';

export type ImportWrite = { table: string; rows: any[]; conflict: string };

export async function importId(workspaceId: string, kind: string, source: unknown): Promise<string> {
  // JSON encoding avoids delimiter/sanitization collisions in old event IDs.
  const bytes = new TextEncoder().encode(JSON.stringify(['kudos-import-v1', workspaceId, kind, source]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `import-${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function remapImportState(workspaceId: string, state: any) {
  if (!state || !Array.isArray(state.profiles) || !Array.isArray(state.tasks) || !Array.isArray(state.rewards)) {
    throw new Error('Invalid migration payload');
  }
  const makeMap = async (rows: any[], kind: string) => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = requiredId(row?.id, `${kind} ID`);
      if (map.has(id)) throw new Error(`Duplicate ${kind} ID`);
      map.set(id, await importId(workspaceId, kind, id));
    }
    return map;
  };
  const profiles = await makeMap(state.profiles, 'profile');
  const tasks = await makeMap(state.tasks, 'task');
  const rewards = await makeMap(state.rewards, 'reward');
  const reference = (map: Map<string, string>, id: unknown, label: string) => {
    const target = map.get(requiredId(id, label));
    if (!target) throw new Error(`${label} is outside the imported state`);
    return target;
  };
  const assignments = (ids: unknown) => {
    if (ids == null) return [];
    if (!Array.isArray(ids)) throw new Error('Invalid assignments');
    return [...new Set(ids.map((id) => reference(profiles, id, 'Profile ID')))];
  };
  const events = (history: any) => {
    if (history == null) return {};
    if (typeof history !== 'object' || Array.isArray(history)) throw new Error('Invalid import history');
    return Object.fromEntries(Object.entries(history).map(([profileId, values]) => {
      if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) {
        throw new Error('Invalid import history');
      }
      // Repeated awards can share a timestamp; keep event/value indexes aligned.
      return [reference(profiles, profileId, 'Profile ID'), [...values]];
    }));
  };
  const amounts = (history: any, eventMap: any, fallback: unknown, minimum = 0) => {
    if (history != null && (typeof history !== 'object' || Array.isArray(history))) throw new Error('Invalid historical amounts');
    const checked = (value: unknown) => {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('Invalid historical amount');
      return value;
    };
    for (const profileId of Object.keys(history ?? {})) {
      reference(profiles, profileId, 'Profile ID');
      if (!Object.prototype.hasOwnProperty.call(eventMap ?? {}, profileId)) throw new Error('Historical amounts have no matching events');
    }
    return Object.fromEntries(Object.entries(eventMap ?? {}).map(([profileId, values]) => {
      const saved = history?.[profileId];
      if (saved != null && (!Array.isArray(saved) || saved.length !== (values as any[]).length)) throw new Error('Historical amounts do not match events');
      return [reference(profiles, profileId, 'Profile ID'), saved == null
        ? (values as any[]).map(() => checked(fallback)) : saved.map(checked)];
    }));
  };
  const resets = (values: any) => {
    if (values == null) return [];
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) throw new Error('Invalid balance reset history');
    return [...new Set(values)];
  };
  const mapExtras = async (rows: any, kind: string, mapRow: (row: any) => any) => {
    if (rows == null) return [];
    if (!Array.isArray(rows)) throw new Error(`Invalid ${kind}`);
    const ids = await makeMap(rows, kind);
    return rows.map((row: any) => ({ ...row, ...mapRow(row), id: ids.get(row.id) }));
  };
  return {
    ...state,
    profiles: state.profiles.map((row: any) => ({ ...row, id: profiles.get(row.id), balanceResetEvents: resets(row.balanceResetEvents) })),
    tasks: state.tasks.map((row: any) => ({ ...row, id: tasks.get(row.id),
      assignedProfileIds: assignments(row.assignedProfileIds), completionEvents: events(row.completionEvents),
      completionAmounts: amounts(row.completionAmounts, row.completionEvents, row.amount, 1) })),
    rewards: state.rewards.map((row: any) => ({ ...row, id: rewards.get(row.id),
      assignedProfileIds: assignments(row.assignedProfileIds), redemptionEvents: events(row.redemptionEvents),
      redemptionAccountingEvents: events(row.redemptionAccountingEvents),
      redemptionCosts: amounts(row.redemptionCosts, row.redemptionEvents, row.cost) })),
    completionRequests: await mapExtras(state.completionRequests, 'request', (row) => ({
      taskId: reference(tasks, row.taskId, 'Task ID'), profileId: reference(profiles, row.profileId, 'Profile ID'),
    })),
    rewardDeliveries: await mapExtras(state.rewardDeliveries, 'delivery', (row) => ({
      rewardId: reference(rewards, row.rewardId, 'Reward ID'), profileId: reference(profiles, row.profileId, 'Profile ID'),
    })),
  };
}

async function validateExistingRows(client: any, workspaceId: string, write: ImportWrite, requireAll = false) {
  if (write.conflict !== 'id') return;
  const columns = ['id', 'workspace_id', ...['profile_id', 'task_id', 'reward_id', 'source_id']
    .filter((key) => write.rows.some((row) => row[key] != null))];
  for (let start = 0; start < write.rows.length; start += 100) {
    const batch = write.rows.slice(start, start + 100);
    const expected = new Map(batch.map((row) => [row.id, row]));
    const { data, error } = await client.from(write.table).select(columns.join(','))
      .in('id', batch.map((row) => row.id));
    if (error) throw error;
    for (const row of data ?? []) {
      const target = expected.get(row.id);
      if (row.workspace_id !== workspaceId || columns.some((key) => target[key] != null && row[key] !== target[key])) {
        throw new Error('Import ID belongs to another workspace or record');
      }
    }
    if (requireAll && (data ?? []).length !== expected.size) throw new Error('Imported records could not be verified');
  }
}

export async function writeImportPlan(client: any, workspaceId: string, writes: ImportWrite[]) {
  // Preflight every table before the first write. All cross-record references
  // were already resolved against the submitted import by remapImportState.
  for (const write of writes) await validateExistingRows(client, workspaceId, write);
  for (const write of writes) {
    if (!write.rows.length) continue;
    const { error } = await client.from(write.table).upsert(write.rows,
      { onConflict: write.conflict, ignoreDuplicates: true });
    if (error) throw error;
    // Verify conflicts as well as inserts before creating dependent records.
    // DO NOTHING is deliberate: even a concurrent collision cannot overwrite
    // somebody else's record or alter an existing import's history.
    await validateExistingRows(client, workspaceId, write, true);
  }
}
