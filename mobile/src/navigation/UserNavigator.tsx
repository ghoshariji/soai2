import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

import HomeScreen from '@/screens/user/HomeScreen';
import ChatListScreen from '@/screens/user/ChatListScreen';
import AnnouncementsScreen from '@/screens/user/AnnouncementsScreen';
import ComplaintsScreen from '@/screens/user/ComplaintsScreen';
import ProfileScreen from '@/screens/user/ProfileScreen';

import { Colors } from '@/theme';

// ---------------------------------------------------------------------------
// Tab param list
// ---------------------------------------------------------------------------

export type UserTabParamList = {
  Home: undefined;
  Chat: undefined;
  Announcements: undefined;
  Complaints: undefined;
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
    backgroundColor: 'rgba(108, 99, 255, 0.12)',
  },
});

// ---------------------------------------------------------------------------
// Tab navigator
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<UserTabParamList>();

const UserNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName="Home"
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
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="home" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatListScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="chatbubbles" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{
          tabBarLabel: 'Notices',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="megaphone" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Complaints"
        component={ComplaintsScreen}
        options={{
          tabBarLabel: 'Complaints',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="alert-circle" focused={focused} size={size} />
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

export default UserNavigator;
