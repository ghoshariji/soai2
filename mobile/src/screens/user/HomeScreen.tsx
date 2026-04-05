import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';
import { useAppSelector } from '@/store';
import PostCard, { type Post } from '@/components/feed/PostCard';
import CreatePostSheet from '@/components/feed/CreatePostSheet';
import CommentsModal from '@/components/feed/CommentsModal';
import EmptyState from '@/components/common/EmptyState';
import { postService, getApiErrorMessage } from '@/services/api';
import { socketService, SocketEvents } from '@/services/socket';
import { normalizeFeedPost } from '@/utils/feed';

const PAGE_SIZE = 10;

const TAB_BAR_CLEARANCE = 56;

export interface HomeScreenProps {
  /** Hide notification / groups shortcuts (e.g. feed opened from society admin Community stack). */
  hideShortcuts?: boolean;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ hideShortcuts = false }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAppSelector((s) => s.auth.user);
  const currentUserId = user?.id ?? '';
  const canManageFeed =
    user?.role === 'society_admin' || user?.role === 'super_admin';

  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const postsRef = useRef<Post[]>([]);
  postsRef.current = posts;

  const openStack = (name: 'Notifications' | 'Groups') => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate(name as never);
    }
  };

  const fetchPage = useCallback(
    async (nextPage: number, mode: 'reset' | 'append') => {
      if (!user?.societyId) return;
      try {
        const res = await postService.getAll({ page: nextPage, limit: PAGE_SIZE });
        const rawList = res.data.data as Record<string, unknown>[];
        const mapped = rawList
          .map((r) => normalizeFeedPost(r))
          .filter((p): p is Post => p != null);
        const meta = res.data.meta;
        setHasMore(meta?.hasNextPage ?? false);
        setPage(nextPage);
        setListError(null);
        setPosts((prev) => {
          if (mode === 'reset') return mapped;
          const seen = new Set(prev.map((p) => p._id));
          const extra = mapped.filter((p) => !seen.has(p._id));
          return [...prev, ...extra];
        });
      } catch (e) {
        const msg = getApiErrorMessage(e);
        setListError(msg);
        if (mode === 'reset') setPosts([]);
        Toast.show({ type: 'error', text1: 'Feed unavailable', text2: msg });
      }
    },
    [user?.societyId],
  );

  const onRefresh = useCallback(async () => {
    if (!user?.societyId) return;
    setRefreshing(true);
    await fetchPage(1, 'reset');
    setRefreshing(false);
  }, [fetchPage, user?.societyId]);

  const loadInitial = useCallback(async () => {
    if (!user?.societyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    await fetchPage(1, 'reset');
    setLoading(false);
  }, [fetchPage, user?.societyId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!user?.societyId) return;

    const onNewPost = (payload: unknown) => {
      const p = payload as { post?: Record<string, unknown> };
      if (!p.post) return;
      const normalised = normalizeFeedPost(p.post);
      if (!normalised) return;
      setPosts((prev) => {
        if (prev.some((x) => x._id === normalised._id)) return prev;
        return [normalised, ...prev];
      });
    };

    const onLikeUpdated = (payload: unknown) => {
      const p = payload as { postId?: string; likesCount?: number; likes?: string[] };
      if (!p.postId) return;
      setPosts((prev) =>
        prev.map((row) =>
          row._id === p.postId
            ? {
                ...row,
                likesCount: p.likesCount ?? row.likesCount,
                likes: Array.isArray(p.likes) ? p.likes : row.likes,
              }
            : row,
        ),
      );
    };

    const onNewComment = (payload: unknown) => {
      const p = payload as { postId?: string; commentsCount?: number };
      if (p.postId == null || p.commentsCount == null) return;
      setPosts((prev) =>
        prev.map((row) =>
          row._id === p.postId ? { ...row, commentsCount: p.commentsCount! } : row,
        ),
      );
    };

    const onCommentDeleted = (payload: unknown) => {
      const p = payload as { postId?: string; commentsCount?: number };
      if (p.postId == null || p.commentsCount == null) return;
      setPosts((prev) =>
        prev.map((row) =>
          row._id === p.postId ? { ...row, commentsCount: p.commentsCount! } : row,
        ),
      );
    };

    const onPostDeleted = (payload: unknown) => {
      const p = payload as { postId?: string };
      if (!p.postId) return;
      setPosts((prev) => prev.filter((row) => row._id !== p.postId));
      setCommentsPostId((id) => (id === p.postId ? null : id));
    };

    socketService.on(SocketEvents.NEW_POST, onNewPost);
    socketService.on(SocketEvents.LIKE_UPDATED, onLikeUpdated);
    socketService.on(SocketEvents.NEW_COMMENT, onNewComment);
    socketService.on(SocketEvents.COMMENT_DELETED, onCommentDeleted);
    socketService.on(SocketEvents.POST_DELETED, onPostDeleted);

    return () => {
      socketService.off(SocketEvents.NEW_POST, onNewPost);
      socketService.off(SocketEvents.LIKE_UPDATED, onLikeUpdated);
      socketService.off(SocketEvents.NEW_COMMENT, onNewComment);
      socketService.off(SocketEvents.COMMENT_DELETED, onCommentDeleted);
      socketService.off(SocketEvents.POST_DELETED, onPostDeleted);
    };
  }, [user?.societyId]);

  const handleLike = useCallback(async (postId: string) => {
    const prevSnapshot = postsRef.current.map((p) => ({
      ...p,
      likes: [...p.likes],
    }));
    setPosts((prev) =>
      prev.map((p) => {
        if (p._id !== postId) return p;
        const liked = p.likes.includes(currentUserId);
        const nextLikes = liked
          ? p.likes.filter((x) => x !== currentUserId)
          : [...p.likes, currentUserId];
        return {
          ...p,
          likes: nextLikes,
          likesCount: liked ? Math.max(0, p.likesCount - 1) : p.likesCount + 1,
        };
      }),
    );
    try {
      const res = await postService.like(postId);
      const d = res.data.data;
      setPosts((prev) =>
        prev.map((p) =>
          p._id === postId
            ? {
                ...p,
                likesCount: d.likesCount,
                likes: d.likes,
              }
            : p,
        ),
      );
    } catch {
      setPosts(prevSnapshot);
      Toast.show({ type: 'error', text1: 'Could not update like' });
    }
  }, [currentUserId]);

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await postService.delete(postId);
      setPosts((prev) => prev.filter((p) => p._id !== postId));
      setCommentsPostId((id) => (id === postId ? null : id));
      Toast.show({ type: 'success', text1: 'Post removed' });
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Delete failed',
        text2: getApiErrorMessage(e),
      });
    }
  }, []);

  const onEndReached = useCallback(() => {
    if (!hasMore || loading || loadingMore || refreshing || listError) return;
    setLoadingMore(true);
    fetchPage(page + 1, 'append').finally(() => setLoadingMore(false));
  }, [fetchPage, hasMore, listError, loading, loadingMore, page, refreshing]);

  const onCreated = useCallback((post: Post) => {
    setPosts((prev) => {
      if (prev.some((p) => p._id === post._id)) return prev;
      return [post, ...prev];
    });
  }, []);

  if (!user?.societyId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greet}>Community feed</Text>
            <Text style={styles.name} numberOfLines={1}>
              Hi, {user?.name ?? 'Resident'}
            </Text>
          </View>
        </View>
        <EmptyState
          icon="people-outline"
          title="No society"
          message="Join or be assigned to a society to see the activity feed."
        />
      </SafeAreaView>
    );
  }

  const leaveAdminFeed = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Groups' as never);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        {hideShortcuts ? (
          <TouchableOpacity
            style={styles.topBarBack}
            onPress={leaveAdminFeed}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Back to community"
          >
            <Icon name="chevron-back" size={26} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={[styles.topBarLeft, hideShortcuts ? styles.topBarLeftShrink : null]}>
          <Text style={styles.greet}>Community feed</Text>
          <Text style={styles.name} numberOfLines={1}>
            Hi, {user?.name ?? 'Resident'}
          </Text>
        </View>
        {!hideShortcuts ? (
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => openStack('Notifications')}
              hitSlop={8}
            >
              <Icon name="notifications-outline" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => openStack('Groups')}
              hitSlop={8}
            >
              <Icon name="people-outline" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Groups' as never)}
              hitSlop={8}
              accessibilityLabel="Community groups and create group"
            >
              <Icon name="people-outline" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : listError && posts.length === 0 ? (
        <View style={styles.errorWrap}>
          <EmptyState
            icon="newspaper-outline"
            title="Could not load feed"
            message={listError}
          />
          <TouchableOpacity style={styles.retryBtn} onPress={() => void loadInitial()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={Colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="images-outline"
              title="No posts yet"
              message={
                canManageFeed
                  ? 'Share an update with your society.'
                  : 'Your society has not posted anything yet. Check back later.'
              }
            />
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              currentUserId={currentUserId}
              onLike={handleLike}
              onComment={(id) => setCommentsPostId(id)}
              onDelete={canManageFeed ? handleDelete : undefined}
              canModerate={canManageFeed}
            />
          )}
        />
      )}

      {canManageFeed ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: Spacing.lg + insets.bottom + TAB_BAR_CLEARANCE }]}
          onPress={() => setCreateOpen(true)}
          activeOpacity={0.9}
          accessibilityLabel="Create post"
        >
          <Icon name="add" size={28} color={Colors.bgCard} />
        </TouchableOpacity>
      ) : null}

      {canManageFeed ? (
        <CreatePostSheet
          visible={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={onCreated}
        />
      ) : null}

      <CommentsModal
        visible={commentsPostId != null}
        postId={commentsPostId}
        currentUserId={currentUserId}
        onClose={() => setCommentsPostId(null)}
        canModerate={canManageFeed}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
  topBarBack: {
    justifyContent: 'center',
    marginRight: Spacing.xs,
    paddingVertical: 4,
  },
  topBarLeft: { flex: 1, marginRight: Spacing.md },
  topBarLeftShrink: { marginRight: Spacing.sm },
  greet: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    maxWidth: 220,
    marginTop: Spacing.sm,
  },
  topActions: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: {
    paddingTop: Spacing.xs,
    paddingBottom: 100,
  },
  footerLoader: { marginVertical: Spacing.md },
  errorWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  retryBtn: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
  },
  retryText: { color: Colors.bgCard, fontWeight: '700', fontSize: 15 },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});

export default HomeScreen;
