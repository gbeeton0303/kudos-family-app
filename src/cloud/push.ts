import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { requireSupabase } from './supabase';

const PUSH_TOKEN_KEY = '@brightsteps/expo-push-token-v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerDeviceForPush(workspaceId: string) {
  if (Platform.OS === 'web' || !Device.isDevice) return { registered: false, reason: 'Physical device required.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Kudos updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { registered: false, reason: 'Notification permission not granted.' };

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return { registered: false, reason: 'Run eas init so an EAS project ID is available.' };
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { data, error } = await requireSupabase().functions.invoke('register-device', {
    body: { action: 'register', workspaceId, expoPushToken: token, platform: Platform.OS },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  return { registered: true, token };
}

export async function unregisterDeviceForPush() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  try {
    await requireSupabase().functions.invoke('register-device', {
      body: { action: 'unregister', expoPushToken: token },
    });
  } finally {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  }
}
