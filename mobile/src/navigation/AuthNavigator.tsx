import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '@/screens/auth/SplashScreen';
import LoginScreen from '@/screens/auth/LoginScreen';

// ---------------------------------------------------------------------------
// Param list
// ---------------------------------------------------------------------------

export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
};

// ---------------------------------------------------------------------------
// Navigator
// ---------------------------------------------------------------------------

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
