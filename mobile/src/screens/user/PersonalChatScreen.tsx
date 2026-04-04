import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, KeyboardAvoidingView,
  Platform, Text, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchPersonalMessages, addMessage, setTyping, markMessageRead } from '@/store/slices/chatSlice';
import { chatService } from '@/services/api';
import { socketService } from '@/services/socket';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import Avatar from '@/components/common/Avatar';
import { Colors, Spacing, Typography } from '@/theme';
import Header from '@/components/common/Header';

type RouteParams = { userId: string; userName: string; userPhoto?: string };

const PersonalChatScreen: React.FC = () => {
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { userId, userName, userPhoto } = route.params;

  const currentUser = useAppSelector((s) => s.auth.user);
  const messages = useAppSelector((s) => s.chat.messages[`personal_${userId}`] || []);
  const typingUsers = useAppSelector((s) => s.chat.typingUsers[userId] || []);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const roomId = `personal_${userId}`;

  useEffect(() => {
    dispatch(fetchPersonalMessages({ userId, page: 1 }));

    // Socket listeners
    socketService.on('receive_message', (msg: any) => {
      if (
        msg.type === 'personal' &&
        (msg.senderId === userId || msg.receiverId === userId)
      ) {
        dispatch(addMessage({ roomId, message: msg }));
        socketService.emit('mark_read', { messageId: msg._id });
      }
    });

    socketService.on('typing', (data: any) => {
      if (data.userId === userId) {
        dispatch(setTyping({ roomId: userId, userName: data.name, isTyping: data.typing }));
      }
    });

    return () => {
      socketService.off('receive_message');
      socketService.off('typing');
    };
  }, [userId]);

  const handleSend = useCallback(
    (text: string) => {
      socketService.emit('send_message', {
        type: 'personal',
        content: text,
        receiverId: userId,
      });
    },
    [userId]
  );

  const handleTyping = useCallback(
    (typing: boolean) => {
      socketService.emit(typing ? 'typing' : 'stop_typing', { roomId: `user_${userId}` });
    },
    [userId]
  );

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    const result = await dispatch(fetchPersonalMessages({ userId, page: nextPage })) as any;
    if (result.payload?.messages?.length < 20) setHasMore(false);
    setPage(nextPage);
    setIsLoadingMore(false);
  };

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <View style={styles.container}>
      <Header
        title={userName}
        subtitle={typingUsers.length ? 'typing...' : undefined}
        showBack
        leftAction={<Avatar name={userName} uri={userPhoto} size="sm" />}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={sortedMessages}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              currentUserId={currentUser?.id || ''}
              senderName={userName}
              senderPhoto={userPhoto}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            isLoadingMore ? <ActivityIndicator color={Colors.primary} style={styles.loader} /> : null
          }
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
        {typingUsers.length > 0 && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{userName} is typing...</Text>
          </View>
        )}
        <ChatInput onSend={handleSend} onTyping={handleTyping} />
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  messageList: { padding: Spacing.md, paddingBottom: Spacing.sm },
  loader: { paddingVertical: Spacing.sm },
  typingRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs },
  typingText: { ...Typography.caption, color: Colors.textMuted, fontStyle: 'italic' },
});

export default PersonalChatScreen;
