import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { postService, getApiErrorMessage } from '@/services/api';
import { socketService, SocketEvents } from '@/services/socket';
import Avatar from '@/components/common/Avatar';
import { Colors, Spacing, Radius } from '@/theme';
import { normalizeFeedComment, type FeedCommentRow } from '@/utils/feed';

interface CommentsModalProps {
  visible: boolean;
  postId: string | null;
  currentUserId: string;
  onClose: () => void;
  /** Society admin: show composer and can delete any comment. Residents are read-only. */
  canModerate?: boolean;
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString();
}

const CommentsModal: React.FC<CommentsModalProps> = ({
  visible,
  postId,
  currentUserId: _currentUserId,
  onClose,
  canModerate = false,
}) => {
  const [items, setItems] = useState<FeedCommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(
    async (p: number, append: boolean) => {
      if (!postId) return;
      setLoading(true);
      try {
        const res = await postService.getComments(postId, { page: p, limit: 30 });
        const rows = (res.data.data as Record<string, unknown>[])
          .map((r) => normalizeFeedComment(r))
          .filter((x): x is FeedCommentRow => x != null && !x.parentId);
        setHasMore(res.data.meta?.hasNextPage ?? false);
        setPage(p);
        setItems((prev) => {
          const merged = append ? [...prev, ...rows] : rows;
          const seen = new Set<string>();
          return merged.filter((x) => {
            if (seen.has(x._id)) return false;
            seen.add(x._id);
            return true;
          });
        });
      } catch (e) {
        Toast.show({
          type: 'error',
          text1: 'Could not load comments',
          text2: getApiErrorMessage(e),
        });
      } finally {
        setLoading(false);
      }
    },
    [postId],
  );

  useEffect(() => {
    if (!visible || !postId) return;
    setDraft('');
    setItems([]);
    setPage(1);
    setHasMore(true);
    loadPage(1, false);
  }, [visible, postId, loadPage]);

  useEffect(() => {
    if (!visible || !postId) return;

    const onNewComment = (payload: unknown) => {
      const p = payload as {
        postId?: string;
        comment?: Record<string, unknown>;
      };
      if (p.postId !== postId || !p.comment) return;
      const c = normalizeFeedComment(p.comment);
      if (!c || c.parentId) return;
      setItems((prev) => {
        if (prev.some((x) => x._id === c._id)) return prev;
        return [...prev, c];
      });
    };

    const onCommentDeleted = (payload: unknown) => {
      const p = payload as { postId?: string; commentId?: string };
      if (p.postId !== postId || !p.commentId) return;
      setItems((prev) => prev.filter((x) => x._id !== p.commentId));
    };

    socketService.on(SocketEvents.NEW_COMMENT, onNewComment);
    socketService.on(SocketEvents.COMMENT_DELETED, onCommentDeleted);
    return () => {
      socketService.off(SocketEvents.NEW_COMMENT, onNewComment);
      socketService.off(SocketEvents.COMMENT_DELETED, onCommentDeleted);
    };
  }, [visible, postId]);

  const send = useCallback(async () => {
    const t = draft.trim();
    if (!postId || !t) return;
    if (t.length > 500) {
      Toast.show({ type: 'error', text1: 'Comment too long' });
      return;
    }
    setSending(true);
    try {
      const res = await postService.addComment(postId, t);
      const raw = res.data.data as Record<string, unknown>;
      const c = normalizeFeedComment(raw);
      if (c && !c.parentId) {
        setItems((prev) => {
          if (prev.some((x) => x._id === c._id)) return prev;
          return [...prev, c];
        });
      }
      setDraft('');
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Could not comment',
        text2: getApiErrorMessage(e),
      });
    } finally {
      setSending(false);
    }
  }, [draft, postId]);

  const confirmDelete = useCallback(
    (commentId: string) => {
      if (!postId) return;
      Alert.alert('Delete comment', 'Remove this comment?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await postService.deleteComment(postId, commentId);
              setItems((prev) => prev.filter((x) => x._id !== commentId));
            } catch (e) {
              Toast.show({
                type: 'error',
                text1: 'Delete failed',
                text2: getApiErrorMessage(e),
              });
            }
          },
        },
      ]);
    },
    [postId],
  );

  const loadMore = useCallback(() => {
    if (!loading && hasMore && postId) loadPage(page + 1, true);
  }, [hasMore, loadPage, loading, page, postId]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Icon name="chevron-down" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Comments</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading && items.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(c) => c._id}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {canModerate ? 'No comments yet. Say hello!' : 'No comments yet.'}
              </Text>
            }
            renderItem={({ item }) => {
              return (
                <View style={styles.row}>
                  <Avatar
                    uri={item.authorId.profilePhoto}
                    name={item.authorId.name}
                    size="sm"
                  />
                  <View style={styles.bubble}>
                    <View style={styles.bubbleHeader}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.authorId.name}
                      </Text>
                      <Text style={styles.time}>{formatShortTime(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.body}>{item.content}</Text>
                  </View>
                  {canModerate ? (
                    <TouchableOpacity
                      onPress={() => confirmDelete(item._id)}
                      hitSlop={8}
                      style={styles.trash}
                    >
                      <Icon name="trash-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.trashPlaceholder} />
                  )}
                </View>
              );
            }}
          />
        )}

        {canModerate ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder="Write a comment…"
              placeholderTextColor={Colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={500}
              editable={!sending}
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={send}
              disabled={sending || !draft.trim()}
            >
              {sending ? (
                <ActivityIndicator size="small" color={Colors.bgCard} />
              ) : (
                <Icon name="send" size={20} color={Colors.bgCard} />
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSpacer: { width: 28 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
  empty: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: Spacing.xl,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  bubble: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: Spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  time: { fontSize: 11, color: Colors.textMuted },
  body: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  trash: { paddingTop: 4 },
  trashPlaceholder: { width: 22 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgInput,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CommentsModal;
