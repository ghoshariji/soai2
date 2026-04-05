import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchConversations } from '@/store/slices/chatSlice';
import { groupService } from '@/services/api';
import { Colors, Spacing, Radius } from '@/theme';
import Avatar from '@/components/common/Avatar';
import type { ChatStackParamList } from '@/navigation/ChatStackNavigator';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatList'>;

interface GroupRow {
  _id: string;
  name?: string;
  description?: string;
  memberCount?: number;
  isMember?: boolean;
}

const ChatListScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const conversations = useAppSelector((s) => s.chat.conversations);
  const loading = useAppSelector((s) => s.chat.isLoading);
  const [tab, setTab] = useState<'personal' | 'group'>('personal');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [gLoading, setGLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPersonal = useCallback(async () => {
    await dispatch(fetchConversations());
  }, [dispatch]);

  const loadGroups = useCallback(async () => {
    setGLoading(true);
    try {
      const res = await groupService.getAll({ page: 1, limit: 200 });
      const body = res.data as { data?: GroupRow[] };
      const rows = body.data ?? [];
      const mine = rows.filter((g) => g.isMember);
      setGroups(mine);
    } catch {
      setGroups([]);
    } finally {
      setGLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === 'personal') await loadPersonal();
    else await loadGroups();
    setRefreshing(false);
  }, [tab, loadPersonal, loadGroups]);

  useEffect(() => {
    loadPersonal();
  }, [loadPersonal]);

  useEffect(() => {
    if (tab === 'group') loadGroups();
  }, [tab, loadGroups]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        {tab === 'personal' ? (
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => navigation.navigate('NewChatUserPicker')}
            hitSlop={8}
            accessibilityLabel="Start new chat"
          >
            <Icon name="create-outline" size={22} color={Colors.primary} />
            <Text style={styles.newChatBtnText}>New chat</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'personal' && styles.tabOn]}
          onPress={() => setTab('personal')}
        >
          <Text style={[styles.tabText, tab === 'personal' && styles.tabTextOn]}>
            Personal
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'group' && styles.tabOn]}
          onPress={() => setTab('group')}
        >
          <Text style={[styles.tabText, tab === 'group' && styles.tabTextOn]}>
            Groups
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'personal' ? (
        loading && !refreshing && conversations.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={Colors.primary}
              />
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="chatbubbles-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptySub}>
                  Start chatting from the user directory or when someone messages you.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  navigation.navigate('PersonalChat', {
                    userId: item.userId ?? item.id,
                    userName: item.name,
                    userPhoto: item.profilePhoto ?? undefined,
                  })
                }
              >
                <Avatar name={item.name} uri={item.profilePhoto} size="md" />
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {item.lastMessage || 'No messages yet'}
                  </Text>
                </View>
                {item.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )}
          />
        )
      ) : gLoading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item._id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={Colors.primary}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No group chats</Text>
              <Text style={styles.emptySub}>
                Join a community group from the Groups screen, then open it here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate('GroupChat', {
                  groupId: item._id,
                  groupName: item.name ?? 'Group',
                  memberCount: item.memberCount,
                })
              }
            >
              <View style={styles.groupIcon}>
                <Icon name="people" size={22} color={Colors.primary} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.memberCount != null
                    ? `${item.memberCount} members`
                    : item.description ?? 'Group chat'}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  newChatBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.sm },
  tabOn: { backgroundColor: 'rgba(108,99,255,0.2)' },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  tabTextOn: { color: Colors.primary },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(108,99,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  rowPreview: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.lg },
  emptyTitle: {
    marginTop: Spacing.md,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptySub: {
    marginTop: Spacing.sm,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default ChatListScreen;
