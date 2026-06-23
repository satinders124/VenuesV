import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator, { navigationRef } from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { UnreadProvider } from './src/context/UnreadContext';
import { resetTasksIfNeeded } from './src/config/resetTasks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForPushNotifications } from './src/config/notifications';
import { updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './src/config/firebase';
import * as Notifications from 'expo-notifications';
import SplashScreen from './src/components/SplashScreen';
import { setDoc, doc } from 'firebase/firestore';

// Handle incoming notifications while app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// Screen name from notification data → actual navigator screen name
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
  if (navigationRef.isReady()) {
    navigationRef.navigate(target);
  }
}

function Root() {
  const { loading, user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Register for push notifications and save token
    registerForPushNotifications().then(async token => {
      if (!token) return;
      try {
        const snap = await getDocs(
          query(collection(db,'users'), where('email','==',user.email))
        );
        if (!snap.empty) {
          await updateDoc(doc(db,'users',snap.docs[0].id), {
            expoPushToken: token,
            uid: user.uid,
          });
        }
      } catch(err) {
        console.log('Token save error:', err);
      }
    });

    resetTasksIfNeeded();

    // Handle notification tap (app open or backgrounded)
    const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      navigateFromNotification(screen);
    });

    // Handle notification received while app is in foreground (optional: navigate immediately)
    // Uncomment if you want foreground notifications to also navigate:
    // const fgSub = Notifications.addNotificationReceivedListener(notification => {
    //   const screen = notification.request.content.data?.screen as string | undefined;
    //   navigateFromNotification(screen);
    // });

    return () => {
      tapSub.remove();
      // fgSub.remove();
    };
  }, [user]);

  // Handle notification tap when app was killed (launched via notification)
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