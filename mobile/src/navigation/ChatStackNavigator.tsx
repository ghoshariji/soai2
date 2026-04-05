import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ChatListScreen from '@/screens/shared/ChatListScreen';
import NewChatUserPickerScreen from '@/screens/shared/NewChatUserPickerScreen';
import PersonalChatScreen from '@/screens/user/PersonalChatScreen';
import GroupChatScreen from '@/screens/user/GroupChatScreen';

export type ChatStackParamList = {
  ChatList: undefined;
  NewChatUserPicker: undefined;
  PersonalChat: {
    userId: string;
    userName: string;
    userPhoto?: string;
  };
  GroupChat: {
    groupId: string;
    groupName: string;
    memberCount?: number;
  };
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

const ChatStackNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ChatList" component={ChatListScreen} />
    <Stack.Screen name="NewChatUserPicker" component={NewChatUserPickerScreen} />
    <Stack.Screen name="PersonalChat" component={PersonalChatScreen} />
    <Stack.Screen name="GroupChat" component={GroupChatScreen} />
  </Stack.Navigator>
);

export default ChatStackNavigator;
