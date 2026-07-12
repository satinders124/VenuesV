import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator, { navigationRef } from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { UnreadProvider } from './src/context/UnreadContext';
import { resetTasksIfNeeded } from './src/config/resetTasks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForPushNotifications } from './src/config/notifications';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { db } from './src/config/firebase';
import * as Notifications from 'expo-notifications';
import SplashScreen from './src/components/SplashScreen';
import { Linking } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

const SCREEN_MAP: Record<string, string> = {
  Issues:    'Issues',
  Tasks:     'Tasks',
  Chat:      'Chat',
  Dashboard: 'Dashboard',
  Overview:  'Overview',
};

function navigateFromNotification(screen: string | undefined) {
  if (!screen) return;
  const target = SCREEN_MAP[screen];
  if (!target) return;
  if (navigationRef.isReady()) navigationRef.navigate(target);
}

function Root() {
  const { loading, user, refreshUser } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Save push token directly to users/{uid}
    registerForPushNotifications().then(async token => {
      if (!token) return;
      try {
        await setDoc(doc(db, 'users', user.uid), { expoPushToken: token }, { merge: true });
      } catch(err) {
        console.log('Token save error:', err);
      }
    });

    resetTasksIfNeeded();

    // Notification tap handler
    const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      navigateFromNotification(screen);
    });

    // Deep link handler — fired when app opens via venuesv:// URL
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('subscription-success')) {
        // Refresh user doc so subscription banner disappears immediately
        refreshUser();
      }
    });

    // AppState handler — refresh user when app comes back to foreground
    // This catches the case where user paid in browser then switched back
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshUser();
      }
    });

    return () => {
      tapSub.remove();
      linkSub.remove();
      appStateSub.remove();
    };
  }, [user]);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const screen = response.notification.request.content.data?.screen as string | undefined;
      navigateFromNotification(screen);
    });
  }, []);

  if (loading) return (
    <View style={{ flex:1, backgroundColor:'#080a0e', alignItems:'center', justifyContent:'center' }}>
      <ActivityIndicator color="#00c896" size="large" />
    </View>
  );

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UnreadProvider>
          {showSplash
            ? <SplashScreen onFinish={() => setShowSplash(false)} />
            : <Root />
          }
        </UnreadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}