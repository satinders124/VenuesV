import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { safeOnSnapshot } from '../config/firestoreHelpers';

import { useAuth } from '../context/AuthContext';
import { useUnread } from '../context/UnreadContext';
import LoginScreen     from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import TasksScreen     from '../screens/TasksScreen';
import IssuesScreen    from '../screens/IssuesScreen';
import OverviewScreen  from '../screens/OverviewScreen';
import MoreScreen      from '../screens/MoreScreen';
import TeamScreen      from '../screens/TeamScreen';
import AddVenueScreen  from '../screens/AddVenueScreen';
import ChatScreen      from '../screens/ChatScreen';
import ReportsScreen   from '../screens/ReportsScreen';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_OPTIONS = {
  headerShown: false,
  tabBarStyle: {
    backgroundColor: '#0f1218',
    borderTopColor: 'rgba(255,255,255,0.15)',
    borderTopWidth: 1,
    paddingBottom: 8,
    paddingTop: 6,
    height: 65,
  },
  tabBarActiveTintColor: '#00c896',
  tabBarInactiveTintColor: '#6e7a8a',
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const },
};

function getMyVenuesQuery(user: any) {
  if (!user) return null;
  if (user.role === 'owner') {
    return query(collection(db, 'venues'), where('ownerId', '==', user.uid));
  }
  return query(collection(db, 'venues'), where('assignedUids', 'array-contains', user.uid));
}

function useIssuesBadge() {
  const { user } = useAuth();
  const [issueCount, setIssueCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const venuesQuery = getMyVenuesQuery(user);
    if (!venuesQuery) { setIssueCount(0); return; }
    const unsubVenues = safeOnSnapshot(venuesQuery, venueSnap => {
      const venueIds = venueSnap.docs.map((d: any) => d.id);
      if (venueIds.length === 0) { setIssueCount(0); return; }
      const idsForQuery = venueIds.slice(0, 30);
      const unsubIssues = safeOnSnapshot(
        query(
          collection(db, 'issues'),
          where('status', '==', 'open'),
          where('venueId', 'in', idsForQuery)
        ),
        issueSnap => setIssueCount(issueSnap.size)
      );
      return unsubIssues;
    });
    return () => unsubVenues();
  }, [user]);

  return issueCount;
}

// Owner: Overview, Dashboard, Issues, Chat (managers only), More
function OwnerTabs() {
  const { unreadCount } = useUnread();
  const issueCount = useIssuesBadge();
  return (
    <Tab.Navigator screenOptions={TAB_OPTIONS}>
      <Tab.Screen name="Overview"  component={OverviewScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="grid-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Dashboard" component={DashboardScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="home-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Issues"    component={IssuesScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="warning-outline" color={color} size={22} />,
          tabBarBadge: issueCount > 0 ? issueCount : undefined,
        }} />
      <Tab.Screen name="Chat"      component={ChatScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" color={color} size={22} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }} />
      <Tab.Screen name="More"      component={MoreScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="menu-outline" color={color} size={22} /> }} />
    </Tab.Navigator>
  );
}

// Manager: Overview, Tasks, Issues, Chat (owner+staff+cleaners), More
function ManagerTabs() {
  const { unreadCount } = useUnread();
  const issueCount = useIssuesBadge();
  return (
    <Tab.Navigator screenOptions={TAB_OPTIONS}>
      <Tab.Screen name="Overview"  component={OverviewScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="grid-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Tasks"     component={TasksScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="checkmark-circle-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Issues"    component={IssuesScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="warning-outline" color={color} size={22} />,
          tabBarBadge: issueCount > 0 ? issueCount : undefined,
        }} />
      <Tab.Screen name="Chat"      component={ChatScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" color={color} size={22} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }} />
      <Tab.Screen name="More"      component={MoreScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="menu-outline" color={color} size={22} /> }} />
    </Tab.Navigator>
  );
}

// Cleaner: Overview, Tasks, Issues, Chat (manager+staff), More
function CleanerTabs() {
  const { unreadCount } = useUnread();
  const issueCount = useIssuesBadge();
  return (
    <Tab.Navigator screenOptions={TAB_OPTIONS}>
      <Tab.Screen name="Overview"  component={OverviewScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="grid-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Tasks"     component={TasksScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="checkmark-circle-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Issues"    component={IssuesScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="warning-outline" color={color} size={22} />,
          tabBarBadge: issueCount > 0 ? issueCount : undefined,
        }} />
      <Tab.Screen name="Chat"      component={ChatScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" color={color} size={22} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }} />
      <Tab.Screen name="More"      component={MoreScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="menu-outline" color={color} size={22} /> }} />
    </Tab.Navigator>
  );
}

// Staff: Overview, Tasks, Issues, Chat (manager+cleaners), More
function StaffTabs() {
  const { unreadCount } = useUnread();
  const issueCount = useIssuesBadge();
  return (
    <Tab.Navigator screenOptions={TAB_OPTIONS}>
      <Tab.Screen name="Overview"  component={OverviewScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="grid-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Tasks"     component={TasksScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="checkmark-circle-outline" color={color} size={22} /> }} />
      <Tab.Screen name="Issues"    component={IssuesScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="warning-outline" color={color} size={22} />,
          tabBarBadge: issueCount > 0 ? issueCount : undefined,
        }} />
      <Tab.Screen name="Chat"      component={ChatScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" color={color} size={22} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }} />
      <Tab.Screen name="More"      component={MoreScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="menu-outline" color={color} size={22} /> }} />
    </Tab.Navigator>
  );
}

// Gate Team, AddVenue, Reports to owner+manager only
function AppStack() {
  const { user } = useAuth();
  const role = user?.role;
  const isOwnerOrManager = role === 'owner' || role === 'manager';

  const Tabs = role === 'owner'   ? OwnerTabs
             : role === 'manager' ? ManagerTabs
             : role === 'cleaner' ? CleanerTabs
             : StaffTabs;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      {isOwnerOrManager && (
        <>
          <Stack.Screen name="Team"     component={TeamScreen}    />
          <Stack.Screen name="AddVenue" component={AddVenueScreen}/>
          <Stack.Screen name="Reports"  component={ReportsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export const navigationRef = createNavigationContainerRef<any>();

export default function AppNavigator() {
  const { user } = useAuth();
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="App"   component={AppStack} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}