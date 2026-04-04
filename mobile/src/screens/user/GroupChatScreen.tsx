import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, KeyboardAvoidingView,
  Platform, Text, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchGroupMessages, addMessage, setTyping } from '@/store/slices/chatSlice';
import { socketService } from '@/services/socket';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import Avatar from '@/components/common/Avatar';
import Header from '@/components/common/Header';
import { Colors, Spacing, Typography } from '@/theme';

type RouteParams = { groupId: string; groupName: string; memberCount?: number };

const GroupChatScreen: React.FC = () => {
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const { groupId, groupName, memberCount } = route.params;

  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((s) => s.auth.user);
  const messages = useAppSelector((s) => s.chat.messages[`group_${groupId}`] || []);
  const typingUsers = useAppSelector((s) => s.chat.typingUsers[groupId] || []);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const roomId = `group_${groupId}`;

  useEffect(() => {
    dispatch(fetchGroupMessages({ groupId, page: 1 }));
    socketService.emit('join_group', { groupId });

    socketService.on('receive_message', (msg: any) => {
      if (msg.type === 'group' && msg.groupId === groupId) {
        dispatch(addMessage({ roomId, message: msg }));
        socketService.emit('mark_read', { messageId: msg._id });
      }
    });

    socketService.on('typing', (data: any) => {
      if (data.roomId === `group_${groupId}`) {
        dispatch(setTyping({ roomId: groupId, userName: data.name, isTyping: data.typing }));
      }
    });

    return () => {
      socketService.off('receive_message');
      socketService.off('typing');
    };
  }, [groupId]);

  const handleSend = useCallback(
    (text: string) => {
      socketService.emit('send_message', {
        type: 'group',
        content: text,
        groupId,
      });
    },
    [groupId]
  );

  const handleTyping = useCallback(
    (typing: boolean) => {
      socketService.emit(typing ? 'typing' : 'stop_typing', {
        roomId: `group_${groupId}`,
      });
    },
    [groupId]
  );

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    const result = await dispatch(fetchGroupMessages({ groupId, page: nextPage })) as any;
    if (result.payload?.messages?.length < 20) setHasMore(false);
    setPage(nextPage);
    setIsLoadingMore(false);
  };

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const typingText = typingUsers.length
    ? typingUsers.length === 1
      ? `${typingUsers[0]} is typing...`
      : `${typingUsers.length} people are typing...`
    : null;

  return (
    <View style={styles.container}>
      <Header
        title={groupName}
        subtitle={memberCount ? `${memberCount} members` : undefined}
        showBack
        leftAction={<Avatar name={groupName} size="sm" />}
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
              senderName={item.senderId?.name}
              senderPhoto={item.senderId?.profilePhoto}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            isLoadingMore ? (
              <ActivityIndicator color={Colors.primary} style={styles.loader} />
            ) : null
          }
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
        {typingText && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{typingText}</Text>
          </View>
        )}
        <ChatInput onSend={handleSend} onTyping={handleTyping} placeholder="Message group..." />
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

export default GroupChatScreen;
