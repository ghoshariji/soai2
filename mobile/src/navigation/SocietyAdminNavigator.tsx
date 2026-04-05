import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';

import SocietyAdminDashboardScreen from '@/screens/societyAdmin/DashboardScreen';
import UsersScreen from '@/screens/societyAdmin/UsersScreen';
import CreateUserScreen from '@/screens/societyAdmin/CreateUserScreen';
import UserDetailScreen from '@/screens/societyAdmin/UserDetailScreen';
import BulkUploadScreen from '@/screens/societyAdmin/BulkUploadScreen';
import GroupsScreen from '@/screens/societyAdmin/GroupsScreen';
import AnnouncementsScreen from '@/screens/societyAdmin/AnnouncementsScreen';
import ComplaintsScreen from '@/screens/societyAdmin/ComplaintsScreen';
import GroupDetailScreen from '@/screens/societyAdmin/GroupDetailScreen';
import FeedScreen from '@/screens/societyAdmin/FeedScreen';
import ChatStackNavigator from '@/navigation/ChatStackNavigator';
import ProfileScreen from '@/screens/societyAdmin/ProfileScreen';

import { Colors } from '@/theme';

// ---------------------------------------------------------------------------
// Users sub-stack
// ---------------------------------------------------------------------------

export type UsersStackParamList = {
  UsersList: undefined;
  CreateUser: undefined;
  UserDetail: { userId: string };
  BulkUpload: undefined;
};

const UsersStack = createNativeStackNavigator<UsersStackParamList>();

const UsersStackNavigator: React.FC = () => (
  <UsersStack.Navigator screenOptions={{ headerShown: false }}>
    <UsersStack.Screen name="UsersList" component={UsersScreen} />
    <UsersStack.Screen name="CreateUser" component={CreateUserScreen} />
    <UsersStack.Screen name="UserDetail" component={UserDetailScreen} />
    <UsersStack.Screen name="BulkUpload" component={BulkUploadScreen} />
  </UsersStack.Navigator>
);

// ---------------------------------------------------------------------------
// Community sub-stack (Groups + Announcements + Complaints)
// ---------------------------------------------------------------------------

export type CommunityStackParamList = {
  Feed: undefined;
  Groups: undefined;
  GroupDetail: { groupId: string; name?: string };
  Announcements: undefined;
  Complaints: undefined;
};

const CommunityStack = createNativeStackNavigator<CommunityStackParamList>();

const CommunityStackNavigator: React.FC = () => (
  <CommunityStack.Navigator
    initialRouteName="Groups"
    screenOptions={{ headerShown: false }}
  >
    <CommunityStack.Screen name="Groups" component={GroupsScreen} />
    <CommunityStack.Screen name="Feed" component={FeedScreen} />
    <CommunityStack.Screen name="GroupDetail" component={GroupDetailScreen} />
    <CommunityStack.Screen name="Announcements" component={AnnouncementsScreen} />
    <CommunityStack.Screen name="Complaints" component={ComplaintsScreen} />
  </CommunityStack.Navigator>
);

// ---------------------------------------------------------------------------
// Tab param list
// ---------------------------------------------------------------------------

export type SocietyAdminTabParamList = {
  Dashboard: undefined;
  Users: undefined;
  Community: undefined;
  Chat: undefined;
  Profile: undefined;
};

// ---------------------------------------------------------------------------
// Shared tab icon
// ---------------------------------------------------------------------------

interface TabIconProps {
  name: string;
  focused: boolean;
  size: number;
}

const TabIcon: React.FC<TabIconProps> = ({ name, focused, size }) => (
  <View style={[tabIconStyles.wrapper, focused && tabIconStyles.focused]}>
    <Icon
      name={focused ? name : `${name}-outline`}
      size={size}
      color={focused ? Colors.primary : Colors.textMuted}
    />
  </View>
);

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  focused: {
    backgroundColor: 'rgba(79, 70, 229, 0.14)',
  },
});

// ---------------------------------------------------------------------------
// Tab navigator
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<SocietyAdminTabParamList>();

const SocietyAdminNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={SocietyAdminDashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="grid" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Users"
        component={UsersStackNavigator}
        options={{
          tabBarLabel: 'Users',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="people" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityStackNavigator}
        options={{
          tabBarLabel: 'Community',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="layers" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="chatbubbles" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="person" focused={focused} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 2,
  },
});

export default SocietyAdminNavigator;
