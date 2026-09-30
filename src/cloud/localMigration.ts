import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeFamilyState } from '../data/familyData';
import type { FamilyState } from '../types';
import { prepareAvatarForCloud, prepareIconForCloud } from './media';
import { requireSupabase } from './supabase';

const LOCAL_KEYS = [
  '@brightsteps/family-state-v6',
  '@brightsteps/family-state-v5',
  '@brightsteps/family-state-v4',
  '@brightsteps/family-state-v3',
  '@brightsteps/family-state-v2',
  '@brightsteps/family-state-v1',
];

function markerKey(workspaceId: string) {
  return `@brightsteps/cloud-migration-complete/${workspaceId}`;
}

export async function getLocalMigrationCandidate(workspaceId: string): Promise<FamilyState | null> {
  if (await AsyncStorage.getItem(markerKey(workspaceId))) return null;
  for (const key of LOCAL_KEYS) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const state = normalizeFamilyState(JSON.parse(raw));
      if (state.profiles.length || state.tasks.length || state.rewards.length) return state;
    } catch {
      // Try the next legacy key.
    }
  }
  return null;
}

export async function migrateLocalState(workspaceId: string, state: FamilyState) {
  const cloudState: FamilyState = {
    ...state,
    profiles: await Promise.all(state.profiles.map(async (profile) => {
      if (profile.avatar.type === 'preset') return profile;
      const uploaded = await prepareAvatarForCloud(workspaceId, profile.id, profile.avatar);
      return { ...profile, avatar: { type: 'photo' as const, uri: uploaded.value } };
    })),
    tasks: await Promise.all(state.tasks.map(async (task) => {
      if (task.icon.type === 'preset') return task;
      const uploaded = await prepareIconForCloud(workspaceId, 'tasks', task.id, task.icon);
      return { ...task, icon: { type: 'photo' as const, uri: uploaded.value } };
    })),
    rewards: await Promise.all(state.rewards.map(async (reward) => {
      if (reward.icon.type === 'preset') return reward;
      const uploaded = await prepareIconForCloud(workspaceId, 'rewards', reward.id, reward.icon);
      return { ...reward, icon: { type: 'photo' as const, uri: uploaded.value } };
    })),
  };
  const { data, error } = await requireSupabase().functions.invoke('migrate-local-data', {
    body: { workspaceId, state: cloudState, sourceVersion: 'brightsteps-local-v6' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await AsyncStorage.setItem(markerKey(workspaceId), new Date().toISOString());
}

export async function skipLocalMigration(workspaceId: string) {
  await AsyncStorage.setItem(markerKey(workspaceId), `skipped:${new Date().toISOString()}`);
}
