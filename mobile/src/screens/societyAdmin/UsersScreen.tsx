import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';

import { userService } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import Badge from '../../components/common/Badge';
import { Colors, Spacing, Radius } from '../../theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterType = 'all' | 'active' | 'inactive' | 'blocked';

interface AppUser {
  _id: string;
  name: string;
  email: string;
  flatNumber: string | null;
  status: 'active' | 'inactive' | 'blocked' | 'pending';
  role: 'user' | 'society_admin' | 'super_admin';
  profilePhoto: string | null;
}

type RootStackParamList = {
  UserDetail: { userId: string };
  CreateUser: undefined;
  BulkUpload: undefined;
};

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(
  s: string,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (s === 'active')   return 'success';
  if (s === 'inactive') return 'warning';
  if (s === 'blocked')  return 'error';
  if (s === 'pending')  return 'info';
  return 'default';
}

function roleVariant(
  r: string,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (r === 'super_admin')   return 'error';
  if (r === 'society_admin') return 'warning';
  return 'info';
}

function normaliseUser(u: Record<string, unknown>): AppUser {
  return {
    _id:          (u._id ?? u.id ?? '') as string,
    name:         (u.name ?? '') as string,
    email:        (u.email ?? '') as string,
    flatNumber:   (u.flatNumber ?? null) as string | null,
    status:       (u.status ?? 'active') as AppUser['status'],
    role:         (u.role ?? 'user') as AppUser['role'],
    profilePhoto: (u.profilePhoto ?? null) as string | null,
  };
}

// ---------------------------------------------------------------------------
// UserCard
// ---------------------------------------------------------------------------

interface UserCardProps {
  user: AppUser;
  onPress: () => void;
  onLongPress: () => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onPress, onLongPress }) => (
  <TouchableOpacity
    style={styles.userCard}
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.75}
    delayLongPress={400}
  >
    <Avatar uri={user.profilePhoto} name={user.name} size="md" />
    <View style={styles.userInfo}>
      <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
      <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
      {user.flatNumber ? (
        <View style={styles.flatRow}>
          <Icon name="home-outline" size={11} color={Colors.textMuted} />
          <Text style={styles.flatText}>{user.flatNumber}</Text>
        </View>
      ) : null}
    </View>
    <View style={styles.badgeCol}>
      <Badge label={user.status} variant={statusVariant(user.status)} size="sm" />
      <Badge label={user.role.replace(/_/g, ' ')} variant={roleVariant(user.role)} size="sm" />
    </View>
    <Icon name="chevron-forward" size={16} color={Colors.textMuted} style={styles.chevron} />
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Active',   value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Blocked',  value: 'blocked' },
];

const PAGE_SIZE = 20;

const UsersScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();

  const [users, setUsers]             = useState<AppUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState<FilterType>('all');
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [error, setError]             = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Data fetching ----

  const fetchUsers = useCallback(
    async (pg: number, q: string, f: FilterType, append = false) => {
      try {
        if (!append) setLoading(true);
        setError(null);

        const params: Record<string, unknown> = { page: pg, limit: PAGE_SIZE };
        if (q) params.search = q;
        if (f !== 'all') params.status = f;

        const res    = await userService.getAll(params as Parameters<typeof userService.getAll>[0]);
        const raw    = res.data;
        const mapped = (raw.data as Record<string, unknown>[]).map(normaliseUser);

        setUsers((prev) => (append ? [...prev, ...mapped] : mapped));
        setTotalPages(raw.totalPages ?? 1);
      } catch {
        setError('Failed to load users. Pull to refresh.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setPage(1);
    fetchUsers(1, search, filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // ---- Debounced search ----

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchUsers(1, text, filter);
    }, 400);
  };

  // ---- Pagination ----

  const handleLoadMore = () => {
    if (loadingMore || page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    fetchUsers(next, search, filter, true);
  };

  // ---- Quick actions ----

  const handleToggleStatus = async (user: AppUser) => {
    try {
      await userService.toggleStatus(user._id);
      setUsers((prev) =>
        prev.map((u) =>
          u._id === user._id
            ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' }
            : u,
        ),
      );
      Toast.show({ type: 'success', text1: 'Status updated', text2: `${user.name}'s status changed.` });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to update status' });
    }
  };

  const handleDeleteUser = (user: AppUser) => {
    Alert.alert('Delete User', `Delete ${user.name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await userService.delete(user._id);
            setUsers((prev) => prev.filter((u) => u._id !== user._id));
            Toast.show({ type: 'success', text1: 'User deleted' });
          } catch {
            Toast.show({ type: 'error', text1: 'Failed to delete user' });
          }
        },
      },
    ]);
  };

  const showQuickActions = (user: AppUser) => {
    const toggleLabel = user.status === 'active' ? 'Deactivate User' : 'Activate User';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [toggleLabel, 'Delete User', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) handleToggleStatus(user);
          if (idx === 1) handleDeleteUser(user);
        },
      );
    } else {
      Alert.alert(user.name, 'Choose an action', [
        { text: toggleLabel, onPress: () => handleToggleStatus(user) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteUser(user) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // ---- Render helpers ----

  const renderItem = ({ item }: { item: AppUser }) => (
    <UserCard
      user={item}
      onPress={() => navigation.navigate('UserDetail', { userId: item._id })}
      onLongPress={() => showQuickActions(item)}
    />
  );

  const renderFooter = () =>
    loadingMore ? (
      <View style={styles.loadMoreContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    ) : null;

  const renderEmpty = () =>
    loading ? null : (
      <View style={styles.emptyState}>
        <Icon name="people-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>No users found</Text>
        <Text style={styles.emptySubtitle}>
          {search ? 'Try a different search term' : 'No users match this filter'}
        </Text>
      </View>
    );

  // ---- JSX ----

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        <Text style={styles.subtitle}>Manage society members</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearch('');
                setPage(1);
                fetchUsers(1, '', filter);
              }}
            >
              <Icon name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, filter === f.value && styles.filterTabActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterTabText, filter === f.value && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error Banner */}
      {error && !loading ? (
        <View style={styles.errorBox}>
          <Icon name="alert-circle-outline" size={16} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchUsers(1, search, filter)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* List / Loader */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList<AppUser>
          data={users}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB – Create User */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateUser')}
        activeOpacity={0.85}
      >
        <Icon name="person-add" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* FAB2 – Bulk Upload */}
      <TouchableOpacity
        style={styles.fab2}
        onPress={() => navigation.navigate('BulkUpload')}
        activeOpacity={0.85}
      >
        <Icon name="cloud-upload-outline" size={20} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:   { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title:    { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  searchRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, padding: 0 },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterTabText:       { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  filterTabTextActive: { color: Colors.white, fontWeight: '600' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  errorText: { color: Colors.error, fontSize: 13, flex: 1 },
  retryText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },

  listContent:       { paddingHorizontal: Spacing.md, paddingBottom: 120 },
  separator:         { height: Spacing.sm },
  loadMoreContainer: { paddingVertical: Spacing.md, alignItems: 'center' },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  userInfo:  { flex: 1, gap: 2 },
  userName:  { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  userEmail: { fontSize: 12, color: Colors.textSecondary },
  flatRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  flatText:  { fontSize: 11, color: Colors.textMuted },
  badgeCol:  { gap: 4, alignItems: 'flex-end' },
  chevron:   { marginLeft: 4 },

  emptyState:    { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted },

  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.xl + 10,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fab2: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.xl + 78,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: Colors.info,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
});

export default UsersScreen;
