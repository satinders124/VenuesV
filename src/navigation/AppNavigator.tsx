import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { Colors, Radius, Space } from '../theme/tokens';

import { useAuth } from '../context/AuthContext';
import SubscriptionBanner from '../components/SubscriptionBanner';
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
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingBottom: Space.xs,
    paddingTop: Space.xs,
    height: 72,
  },
  tabBarItemStyle: { borderRadius: Radius.md, marginHorizontal: 3 },
  tabBarActiveTintColor: Colors.brand,
  tabBarInactiveTintColor: Colors.textMuted,
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const, marginTop: 1 },
};

function useIssuesBadge() {
  const { user } = useAuth();
  const [issueCount, setIssueCount] = useState(0);

  const fetchIssuesCount = useCallback(async () => {
    if (!user) { setIssueCount(0); return; }
    try {
      let venueIds: string[] = [];
      if (user.role === 'owner') {
        const { data } = await supabase.from('venues').select('id').eq('ownerId', user.uid);
        venueIds = data?.map(d => d.id) || [];
      } else {
        const { data } = await supabase.from('venues').select('id').contains('assignedUids', [user.uid]);
        venueIds = data?.map(d => d.id) || [];
      }

      if (venueIds.length === 0) { setIssueCount(0); return; }

      const { count } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
        .in('venueId', venueIds.slice(0, 30));
        
      setIssueCount(count || 0);
    } catch (err) {
      console.log('Error fetching issues count', err);
    }
  }, [user]);

  useEffect(() => {
    fetchIssuesCount();
    
    if (!user) return;

    const channel = supabase.channel('issues_badge_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, fetchIssuesCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, fetchIssuesCount)
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [fetchIssuesCount, user]);

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
    <View style={{ flex: 1 }}>
      <SubscriptionBanner />
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
    </View>
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