import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';

import SuperAdminDashboardScreen from '@/screens/superAdmin/SuperAdminDashboardScreen';
import SocietiesScreen from '@/screens/superAdmin/SocietiesScreen';
import CreateSocietyScreen from '@/screens/superAdmin/CreateSocietyScreen';
import SocietyDetailScreen from '@/screens/superAdmin/SocietyDetailScreen';
import AnalyticsScreen from '@/screens/superAdmin/AnalyticsScreen';
import SettingsScreen from '@/screens/superAdmin/SettingsScreen';

import { Colors } from '@/theme';

// ---------------------------------------------------------------------------
// Societies sub-stack
// ---------------------------------------------------------------------------

export type SocietiesStackParamList = {
  SocietiesList: undefined;
  CreateSociety: undefined;
  SocietyDetail: { societyId: string };
};

const SocietiesStack = createNativeStackNavigator<SocietiesStackParamList>();

const SocietiesStackNavigator: React.FC = () => (
  <SocietiesStack.Navigator screenOptions={{ headerShown: false }}>
    <SocietiesStack.Screen name="SocietiesList" component={SocietiesScreen} />
    <SocietiesStack.Screen name="CreateSociety" component={CreateSocietyScreen} />
    <SocietiesStack.Screen name="SocietyDetail" component={SocietyDetailScreen} />
  </SocietiesStack.Navigator>
);

// ---------------------------------------------------------------------------
// Tab param list
// ---------------------------------------------------------------------------

export type SuperAdminTabParamList = {
  Dashboard: undefined;
  Societies: undefined;
  Analytics: undefined;
  Settings: undefined;
};

// ---------------------------------------------------------------------------
// Tab navigator
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<SuperAdminTabParamList>();

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

const SuperAdminNavigator: React.FC = () => {
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
        component={SuperAdminDashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="home" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Societies"
        component={SocietiesStackNavigator}
        options={{
          tabBarLabel: 'Societies',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="business" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="bar-chart" focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="settings" focused={focused} size={size} />
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

export default SuperAdminNavigator;
