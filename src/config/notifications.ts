import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

function hasNotificationPermission(
  permission: Notifications.NotificationPermissionsStatus,
) {
  if (Platform.OS !== 'ios') {
    return permission.status === Notifications.PermissionStatus.GRANTED;
  }
  return (
    permission.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

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
  if (!hasNotificationPermission(permission)) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!hasNotificationPermission(permission)) {
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

// ── SEND NOTIFICATION VIA EXPO API ───────────────────────
async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (tokens.length === 0) return;

  const messages = tokens.map(token => ({
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
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const json = await res.json();
    console.log('Push send result:', JSON.stringify(json));
  } catch (err) {
    console.log('Push notification error:', err);
  }
}

// ── GET TOKENS BY ROLE ───────────────────────────────────
async function getTokensByRole(role: string, venue?: string): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('role', '==', role))
    );
    return snap.docs
      .filter(d => {
        if (!venue) return true;
        return d.data().venue?.toLowerCase().trim() === venue.toLowerCase().trim();
      })
      .map(d => d.data().expoPushToken)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
  } catch (err) {
    console.log('getTokensByRole error:', err);
    return [];
  }
}

// ── GET TOKENS FOR SPECIFIC USERS ────────────────────────
async function getTokensForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  try {
    const snapshots = await Promise.all(
      chunkArray([...new Set(userIds)], 30).map(ids =>
        getDocs(query(collection(db, 'users'), where('uid', 'in', ids)))
      )
    );
    return snapshots
      .flatMap(snap => snap.docs)
      .map(d => d.data().expoPushToken)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
  } catch {
    return [];
  }
}

// ── NOTIFICATION TRIGGERS ────────────────────────────────

// Issue raised — notify managers + owners
export async function notifyIssueRaised(
  issueTitle: string,
  priority: string,
  zone: string,
  venueName: string,
  raisedBy: string,
) {
  try {
    const [managerTokens, ownerTokens] = await Promise.all([
      getTokensByRole('manager', venueName),
      getTokensByRole('owner'),
    ]);

    const title = priority === 'high'
      ? `🔴 High Priority — ${venueName}`
      : `⚠️ New Issue — ${venueName}`;
    const body = `${issueTitle} · ${zone} · by ${raisedBy}`;

    const allTokens = [...new Set([...managerTokens, ...ownerTokens])];
    console.log(`Notifying ${allTokens.length} users of issue`);
    await sendPushNotification(allTokens, title, body, { screen: 'Issues', venueName });
  } catch (err) {
    console.log('notifyIssueRaised error:', err);
  }
}

// Issue resolved — notify managers + owners
export async function notifyIssueResolved(
  issueTitle: string,
  venueName: string,
  resolvedBy: string,
) {
  try {
    const [managerTokens, ownerTokens] = await Promise.all([
      getTokensByRole('manager', venueName),
      getTokensByRole('owner'),
    ]);

    const allTokens = [...new Set([...managerTokens, ...ownerTokens])];
    console.log(`Notifying ${allTokens.length} users of resolution`);
    await sendPushNotification(
      allTokens,
      `✅ Issue Resolved — ${venueName}`,
      `"${issueTitle}" resolved by ${resolvedBy}`,
      { screen: 'Issues', venueName }
    );
  } catch (err) {
    console.log('notifyIssueResolved error:', err);
  }
}

// Task created — notify cleaners + staff
export async function notifyTaskCreated(
  taskTitle: string,
  venueName: string,
  createdBy: string,
) {
  try {
    const [cleanerTokens, staffTokens] = await Promise.all([
      getTokensByRole('cleaner', venueName),
      getTokensByRole('staff', venueName),
    ]);

    const allTokens = [...new Set([...cleanerTokens, ...staffTokens])];
    console.log(`Notifying ${allTokens.length} cleaners/staff of new task`);
    await sendPushNotification(
      allTokens,
      `📋 New Task — ${venueName}`,
      `${taskTitle} · Added by ${createdBy}`,
      { screen: 'Tasks', venueName }
    );
  } catch (err) {
    console.log('notifyTaskCreated error:', err);
  }
}

// Chat message — notify recipients
export async function notifyChatMessage(
  senderName: string,
  message: string,
  roomName: string,
  recipientUids: string[],
) {
  try {
    const tokens = await getTokensForUsers(recipientUids);
    console.log(`Notifying ${tokens.length} users of chat message`);
    await sendPushNotification(
      tokens,
      `💬 ${senderName} — ${roomName}`,
      message.length > 80 ? message.slice(0, 80) + '...' : message,
      { screen: 'Chat' }
    );
  } catch (err) {
    console.log('notifyChatMessage error:', err);
  }
}