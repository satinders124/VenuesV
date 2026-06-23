import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ── REGISTER DEVICE ─────────────────────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00c896',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    '1267ba57-d8cf-492d-a1f5-c90980e30153';

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

// ── SEND VIA EXPO PUSH API ───────────────────────────────
async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const valid = tokens.filter(t => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < valid.length; i += chunkSize) {
    const messages = valid.slice(i, i + chunkSize).map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
      badge: 1,
    }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      const json = await res.json();
      console.log('Push result:', JSON.stringify(json));
    } catch (err) {
      console.log('Push error:', err);
    }
  }
}

// ── SEND NOTIFICATION TO SPECIFIC TOKENS ─────────────────
// All notification triggers now accept tokens directly —
// callers are responsible for fetching tokens via Cloud Function
// (Admin SDK) to avoid Firestore rules blocking client-side
// collection reads on the users collection.

export async function notifyIssueRaised(
  tokens: string[],
  issueTitle: string,
  priority: string,
  zone: string,
  venueName: string,
  raisedBy: string,
) {
  const title = priority === 'high'
    ? `🔴 High Priority — ${venueName}`
    : `⚠️ New Issue — ${venueName}`;
  const body = `${issueTitle} · ${zone} · by ${raisedBy}`;
  await sendPushNotification(tokens, title, body, { screen: 'Issues', venueName });
}

export async function notifyIssueResolved(
  tokens: string[],
  issueTitle: string,
  venueName: string,
  resolvedBy: string,
) {
  await sendPushNotification(
    tokens,
    `✅ Issue Resolved — ${venueName}`,
    `"${issueTitle}" resolved by ${resolvedBy}`,
    { screen: 'Issues', venueName }
  );
}

export async function notifyTaskCreated(
  tokens: string[],
  taskTitle: string,
  venueName: string,
  createdBy: string,
) {
  await sendPushNotification(
    tokens,
    `📋 New Task — ${venueName}`,
    `${taskTitle} · Added by ${createdBy}`,
    { screen: 'Tasks', venueName }
  );
}

export async function notifyChatMessage(
  tokens: string[],
  senderName: string,
  message: string,
  roomName: string,
) {
  await sendPushNotification(
    tokens,
    `💬 ${senderName} — ${roomName}`,
    message.length > 80 ? message.slice(0, 80) + '...' : message,
    { screen: 'Chat' }
  );
}