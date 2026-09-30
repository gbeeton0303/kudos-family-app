type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
};

export async function sendExpoPush(messages: PushMessage[]) {
  const valid = messages.filter((message) => message.to.startsWith('ExponentPushToken[') || message.to.startsWith('ExpoPushToken['));
  if (valid.length === 0) return [];
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(valid),
  });
  if (!response.ok) throw new Error(`Expo push failed: ${response.status}`);
  return await response.json();
}
