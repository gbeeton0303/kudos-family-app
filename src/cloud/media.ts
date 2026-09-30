import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import type { ItemIcon, ProfileAvatar } from '../types';
import { requireSupabase } from './supabase';

const BUCKET = 'brightsteps-media';

function parseDataUri(uri: string) {
  const match = uri.match(/^data:([^;]+);base64,(.+)$/s);
  return match ? { contentType: match[1], base64: match[2] } : null;
}

function existingStoragePath(uri: string, workspaceId: string) {
  if (uri.startsWith(`${workspaceId}/`)) return uri;
  if (!/^https?:\/\//i.test(uri)) return null;
  try {
    const parsed = new URL(uri);
    const markers = [
      `/storage/v1/object/sign/${BUCKET}/`,
      `/storage/v1/object/public/${BUCKET}/`,
      `/storage/v1/object/${BUCKET}/`,
    ];
    for (const marker of markers) {
      const index = parsed.pathname.indexOf(marker);
      if (index >= 0) {
        const path = decodeURIComponent(parsed.pathname.slice(index + marker.length));
        if (path.startsWith(`${workspaceId}/`)) return path;
      }
    }
  } catch {}
  return null;
}

function mediaContentType(uri: string) {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  return extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
}

async function readPhoto(uri: string) {
  const dataUri = parseDataUri(uri);
  if (dataUri) return dataUri;
  if (/^https?:\/\//i.test(uri)) {
    throw new Error('Remote photo URL cannot be read as a local file.');
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('The selected photo is no longer available on this device.');
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return { contentType: mediaContentType(uri), base64 };
}

export async function uploadPhoto(workspaceId: string, folder: 'profiles' | 'tasks' | 'rewards', entityId: string, uri: string) {
  const existingPath = existingStoragePath(uri, workspaceId);
  if (existingPath) return existingPath;
  const client = requireSupabase();
  const photo = await readPhoto(uri);
  const extension = photo.contentType === 'image/png' ? 'png' : photo.contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${workspaceId}/${folder}/${entityId}/${Date.now()}.${extension}`;
  const { error } = await client.storage.from(BUCKET).upload(path, decode(photo.base64), {
    contentType: photo.contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function prepareAvatarForCloud(workspaceId: string, profileId: string, avatar: ProfileAvatar) {
  if (avatar.type === 'preset') return { type: 'preset' as const, value: avatar.key };
  return { type: 'photo' as const, value: await uploadPhoto(workspaceId, 'profiles', profileId, avatar.uri) };
}

export async function prepareIconForCloud(workspaceId: string, folder: 'tasks' | 'rewards', entityId: string, icon: ItemIcon) {
  if (icon.type === 'preset') return { type: 'preset' as const, value: icon.value };
  return { type: 'photo' as const, value: await uploadPhoto(workspaceId, folder, entityId, icon.uri) };
}

export async function signMediaPaths(paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) return new Map<string, string>();
  const client = requireSupabase();
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(unique, 60 * 60 * 24);
  if (error) throw error;
  return new Map<string, string>((data ?? []).flatMap((item, index) => item.signedUrl ? [[unique[index], item.signedUrl] as [string, string]] : []));
}
