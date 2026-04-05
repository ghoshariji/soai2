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
import { fetchGroupMessages, addMessage, setTyping } from '@/store/slices/chatSlice';
import { chatService } from '@/services/api';
import { socketService } from '@/services/socket';
import MessageBubble from '@/components/chat/MessageBubble';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ChatInput from '@/components/chat/ChatInput';
import Header from '@/components/common/Header';
import { Colors, Spacing } from '@/theme';
import type { ChatStackParamList } from '@/navigation/ChatStackNavigator';

const GroupChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ChatStackParamList, 'GroupChat'>>();
  const { groupId, groupName, memberCount } = route.params;

  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((s) => s.auth.user);
  const roomId = `group_${groupId}`;
  const messages = useAppSelector((s) => s.chat.messages[roomId] || []);
  const typingUsers = useAppSelector((s) => s.chat.typingUsers[roomId] || []);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    dispatch(fetchGroupMessages({ groupId, page: 1 }));
    socketService.emit('join_group', { groupId });

    const gid = (x: unknown) =>
      x && typeof x === 'object' && x !== null && '_id' in x
        ? String((x as { _id: unknown })._id)
        : String(x ?? '');

    const onGroupSocketMessage = (msg: Record<string, unknown>) => {
      if (msg.type !== 'group') return;
      if (gid(msg.groupId) !== groupId) return;
      dispatch(addMessage({ ...msg, roomId } as Record<string, unknown>));
      socketService.emit('mark_read', { messageId: msg._id });
    };

    socketService.on('receive_message', onGroupSocketMessage);
    /** HTTP send path on server emits this name; keep UI in sync either way. */
    socketService.on('new_group_message', onGroupSocketMessage);

    const onTyping = (data: { roomId?: string; userId?: string; typing?: boolean }) => {
      if (data.roomId === roomId && data.userId) {
        dispatch(
          setTyping({
            roomId,
            userId: data.userId,
            isTyping: Boolean(data.typing),
          }),
        );
      }
    };

    socketService.on('typing', onTyping);

    return () => {
      socketService.off('receive_message', onGroupSocketMessage);
      socketService.off('new_group_message', onGroupSocketMessage);
      socketService.off('typing', onTyping);
    };
  }, [groupId, dispatch, roomId]);

  const handleSend = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      if (socketService.isConnected()) {
        socketService.emit('send_message', {
          type: 'group',
          content: t,
          groupId,
        });
        return;
      }
      try {
        const res = await chatService.sendGroupMessage(groupId, { content: t });
        const body = res.data as { data?: Record<string, unknown> };
        const created = body.data;
        if (created && typeof created === 'object') {
          dispatch(
            addMessage({ ...created, roomId } as Record<string, unknown>),
          );
        }
      } catch {
        /* Toast optional – ChatInput does not surface; rely on user retry */
      }
    },
    [dispatch, groupId, roomId],
  );

  const handleTyping = useCallback(
    (typing: boolean) => {
      socketService.emit(typing ? 'typing' : 'stop_typing', {
        roomId,
      });
    },
    [roomId],
  );

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    const result = await dispatch(fetchGroupMessages({ groupId, page: nextPage }));
    if (
      fetchGroupMessages.fulfilled.match(result) &&
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

  const typingText =
    typingUsers.length > 0 ? 'Someone is typing…' : null;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<(typeof sortedMessages)[0]>) => {
      const isOwn = item.senderId === currentUser?.id;
      return (
        <MessageBubble
          message={item as never}
          currentUserId={currentUser?.id || ''}
          senderName={
            isOwn ? 'You' : item.senderDisplayName?.trim() || 'Member'
          }
          senderPhoto={isOwn ? undefined : item.senderProfilePhoto ?? undefined}
        />
      );
    },
    [currentUser?.id],
  );

  return (
    <View style={styles.container}>
      <Header
        title={groupName}
        subtitle={
          memberCount != null
            ? `${memberCount} members`
            : undefined
        }
        showBack
      />
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
        {typingText ? <TypingIndicator label={typingText} /> : null}
        <ChatInput
          onSend={handleSend}
          onTyping={handleTyping}
          placeholder="Message group..."
        />
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

export default GroupChatScreen;
