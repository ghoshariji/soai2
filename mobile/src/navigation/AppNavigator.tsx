import React, { useEffect, createRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'react-native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '@/utils/toast';

import { useAppSelector, useAppDispatch } from '@/store';
import { getMeThunk } from '@/store/slices/authSlice';
import { getAccessToken } from '@/services/storage';
import { socketService } from '@/services/socket';
import { setNavigationRef } from '@/services/api';

import AuthNavigator from './AuthNavigator';
import SuperAdminNavigator from './SuperAdminNavigator';
import SocietyAdminNavigator from './SocietyAdminNavigator';
import UserNavigator from './UserNavigator';
import { Colors } from '@/theme';

export const navigationRef = createRef<NavigationContainerRef<any>>();

const AppNavigator: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user, accessToken } = useAppSelector((s) => s.auth);

  // On mount: restore session if token exists
  useEffect(() => {
    const restoreSession = async () => {
      const token = await getAccessToken();
      if (token) {
        dispatch(getMeThunk());
      }
    };
    restoreSession();
  }, [dispatch]);

  // Connect socket when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      socketService.connect(accessToken);
    } else {
      socketService.disconnect();
    }
    return () => {
      if (!isAuthenticated) socketService.disconnect();
    };
  }, [isAuthenticated, accessToken]);

  const getNavigator = () => {
    if (!isAuthenticated) return <AuthNavigator />;
    switch (user?.role) {
      case 'super_admin':     return <SuperAdminNavigator />;
      case 'society_admin':   return <SocietyAdminNavigator />;
      case 'user':            return <UserNavigator />;
      default:                return <AuthNavigator />;
    }
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setNavigationRef(navigationRef.current)}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.bg}
        translucent={false}
      />
      {getNavigator()}
      <Toast config={toastConfig} topOffset={52} />
    </NavigationContainer>
  );
};

export default AppNavigator;
