import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ListRenderItemInfo,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchPersonalMessages, addMessage, setTyping } from '@/store/slices/chatSlice';
import { chatService } from '@/services/api';
import { socketService } from '@/services/socket';
import MessageBubble from '@/components/chat/MessageBubble';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ChatInput from '@/components/chat/ChatInput';
import { Colors, Spacing } from '@/theme';
import Header from '@/components/common/Header';
import type { ChatStackParamList } from '@/navigation/ChatStackNavigator';

const PersonalChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ChatStackParamList, 'PersonalChat'>>();
  const dispatch = useAppDispatch();
  const { userId, userName, userPhoto } = route.params;

  const currentUser = useAppSelector((s) => s.auth.user);
  const roomId = `personal_${userId}`;
  const messages = useAppSelector((s) => s.chat.messages[roomId] || []);
  const typingUsers = useAppSelector((s) => s.chat.typingUsers[roomId] || []);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    dispatch(fetchPersonalMessages({ userId, page: 1 }));

    const sid = (m: { senderId?: unknown; receiverId?: unknown }) => {
      const a = m.senderId;
      const b = m.receiverId;
      const id = (x: unknown) =>
        x && typeof x === 'object' && x !== null && '_id' in x
          ? String((x as { _id: unknown })._id)
          : String(x ?? '');
      return { s: id(a), r: id(b) };
    };

    const onPersonalSocketMessage = (msg: Record<string, unknown>) => {
      if (msg.type !== 'personal') return;
      const { s, r } = sid(msg as { senderId?: unknown; receiverId?: unknown });
      if (s === userId || r === userId) {
        dispatch(addMessage({ ...msg, roomId } as Record<string, unknown>));
        socketService.emit('mark_read', { messageId: msg._id });
      }
    };

    socketService.on('receive_message', onPersonalSocketMessage);
    socketService.on('new_personal_message', onPersonalSocketMessage);

    const onTyping = (data: { userId?: string; typing?: boolean }) => {
      if (data.userId === userId) {
        dispatch(
          setTyping({
            roomId,
            userId: userId,
            isTyping: Boolean(data.typing),
          }),
        );
      }
    };

    socketService.on('typing', onTyping);

    return () => {
      socketService.off('receive_message', onPersonalSocketMessage);
      socketService.off('new_personal_message', onPersonalSocketMessage);
      socketService.off('typing', onTyping);
    };
  }, [userId, dispatch, roomId]);

  const handleSend = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      if (socketService.isConnected()) {
        socketService.emit('send_message', {
          type: 'personal',
          content: t,
          receiverId: userId,
        });
        return;
      }
      try {
        const res = await chatService.sendPersonalMessage(userId, { content: t });
        const body = res.data as { data?: Record<string, unknown> };
        const created = body.data;
        if (created && typeof created === 'object') {
          dispatch(
            addMessage({ ...created, roomId } as Record<string, unknown>),
          );
        }
      } catch {
        /* user can retry */
      }
    },
    [dispatch, roomId, userId],
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
    const result = await dispatch(
      fetchPersonalMessages({ userId, page: nextPage }),
    );
    if (
      fetchPersonalMessages.fulfilled.match(result) &&
      (result.payload.messages?.length ?? 0) < 30
    ) {
      setHasMore(false);
    }
    setPage(nextPage);
    setIsLoadingMore(false);
  };

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<(typeof sortedMessages)[0]>) => (
      <MessageBubble
        message={item as never}
        currentUserId={currentUser?.id || ''}
        senderName={userName}
        senderPhoto={userPhoto}
      />
    ),
    [currentUser?.id, userName, userPhoto],
  );

  return (
    <View style={styles.container}>
      <Header title={userName} showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={sortedMessages}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          initialNumToRender={12}
          windowSize={7}
          maxToRenderPerBatch={12}
          removeClippedSubviews={Platform.OS === 'android'}
          updateCellsBatchingPeriod={50}
          ListHeaderComponent={
            isLoadingMore ? (
              <ActivityIndicator color={Colors.primary} style={styles.loader} />
            ) : null
          }
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />
        {typingUsers.length > 0 ? (
          <TypingIndicator label={`${userName} is typing…`} />
        ) : null}
        <ChatInput onSend={handleSend} onTyping={handleTyping} />
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  messageList: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  loader: { paddingVertical: Spacing.sm },
});

export default PersonalChatScreen;
