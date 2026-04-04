import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Radius } from '@/theme';
import { societyService } from '../../services/api';
import Badge from '../../components/common/Badge';
import Avatar from '../../components/common/Avatar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterStatus = 'all' | 'active' | 'inactive';

interface Society {
  _id: string;
  name: string;
  city: string;
  address: string;
  status: 'active' | 'inactive' | 'pending';
  adminName: string;
  adminEmail: string;
  plan: string;
  subscriptionExpiry: string;
  totalMembers: number;
}

type SuperAdminStackParamList = {
  Societies: undefined;
  CreateSociety: undefined;
  SocietyDetail: { societyId: string };
};

type Props = NativeStackScreenProps<SuperAdminStackParamList, 'Societies'>;

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseSociety(raw: Record<string, unknown>): Society {
  const admin = (raw.admin ?? {}) as Record<string, unknown>;
  const sub = (raw.subscription ?? {}) as Record<string, unknown>;
  return {
    _id: (raw._id ?? raw.id ?? '') as string,
    name: (raw.name ?? '') as string,
    city: (raw.city ?? '') as string,
    address: (raw.address ?? '') as string,
    status: (raw.status ?? 'inactive') as Society['status'],
    adminName: (admin.name ?? raw.adminName ?? 'N/A') as string,
    adminEmail: (admin.email ?? raw.adminEmail ?? '') as string,
    plan: (sub.plan ?? raw.plan ?? raw.subscriptionPlan ?? 'basic') as string,
    subscriptionExpiry: (
      sub.expiryDate ??
      raw.subscriptionExpiry ??
      raw.expiryDate ??
      ''
    ) as string,
    totalMembers: (raw.totalMembers ?? raw.memberCount ?? 0) as number,
  };
}

function formatExpiry(iso: string): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function getPlanColor(plan: string): string {
  const p = plan.toLowerCase();
  if (p === 'premium') return Colors.warning;
  if (p === 'custom') return '#8B5CF6';
  return Colors.primary;
}

// ---------------------------------------------------------------------------
// Society card component
// ---------------------------------------------------------------------------

interface SocietyCardProps {
  item: Society;
  onEdit: (id: string) => void;
  onToggle: (id: string, currentStatus: Society['status']) => void;
}

const SocietyCard: React.FC<SocietyCardProps> = ({ item, onEdit, onToggle }) => {
  const planColor = getPlanColor(item.plan);

  return (
    <View style={cardStyles.card}>
      {/* Top row: avatar + name + status */}
      <View style={cardStyles.topRow}>
        <Avatar name={item.name} size="md" style={cardStyles.avatar} />
        <View style={cardStyles.nameBlock}>
          <Text style={cardStyles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={cardStyles.locationRow}>
            <Icon
              name="location-outline"
              size={11}
              color={Colors.textMuted}
            />
            <Text style={cardStyles.city}>{item.city}</Text>
          </View>
        </View>
        <Badge
          label={item.status}
          variant={
            item.status === 'active'
              ? 'success'
              : item.status === 'pending'
              ? 'warning'
              : 'error'
          }
          size="sm"
        />
      </View>

      {/* Details row */}
      <View style={cardStyles.detailsRow}>
        <View style={cardStyles.detailItem}>
          <Icon
            name="person-outline"
            size={12}
            color={Colors.textMuted}
          />
          <Text style={cardStyles.detailText} numberOfLines={1}>
            {item.adminName}
          </Text>
        </View>
        <View style={cardStyles.detailItem}>
          <Icon name="people-outline" size={12} color={Colors.textMuted} />
          <Text style={cardStyles.detailText}>{item.totalMembers} members</Text>
        </View>
      </View>

      {/* Plan + expiry row */}
      <View style={cardStyles.planRow}>
        <View style={[cardStyles.planBadge, { borderColor: planColor + '55' }]}>
          <View
            style={[cardStyles.planDot, { backgroundColor: planColor }]}
          />
          <Text style={[cardStyles.planText, { color: planColor }]}>
            {item.plan.charAt(0).toUpperCase() + item.plan.slice(1)}
          </Text>
        </View>
        <View style={cardStyles.expiryRow}>
          <Icon
            name="calendar-outline"
            size={11}
            color={Colors.textMuted}
          />
          <Text style={cardStyles.expiryText}>
            {formatExpiry(item.subscriptionExpiry)}
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={cardStyles.actionsRow}>
        <TouchableOpacity
          style={[cardStyles.actionBtn, cardStyles.editBtn]}
          onPress={() => onEdit(item._id)}
          activeOpacity={0.75}
        >
          <Icon name="pencil-outline" size={14} color={Colors.primary} />
          <Text style={[cardStyles.actionText, { color: Colors.primary }]}>
            Edit
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            cardStyles.actionBtn,
            item.status === 'active'
              ? cardStyles.deactivateBtn
              : cardStyles.activateBtn,
          ]}
          onPress={() => onToggle(item._id, item.status)}
          activeOpacity={0.75}
        >
          <Icon
            name={
              item.status === 'active'
                ? 'pause-circle-outline'
                : 'play-circle-outline'
            }
            size={14}
            color={item.status === 'active' ? Colors.error : Colors.success}
          />
          <Text
            style={[
              cardStyles.actionText,
              {
                color:
                  item.status === 'active' ? Colors.error : Colors.success,
              },
            ]}
          >
            {item.status === 'active' ? 'Deactivate' : 'Activate'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatar: {
    marginRight: Spacing.sm,
  },
  nameBlock: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  city: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  detailText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  planDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  planText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  editBtn: {
    borderColor: 'rgba(108,99,255,0.35)',
    backgroundColor: 'rgba(108,99,255,0.08)',
  },
  activateBtn: {
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  deactivateBtn: {
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Filter pill
// ---------------------------------------------------------------------------

interface FilterPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
}

const FilterPill: React.FC<FilterPillProps> = ({
  label,
  active,
  onPress,
  count,
}) => (
  <TouchableOpacity
    style={[pillStyles.pill, active && pillStyles.pillActive]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[pillStyles.label, active && pillStyles.labelActive]}>
      {label}
    </Text>
    {count !== undefined ? (
      <View style={[pillStyles.count, active && pillStyles.countActive]}>
        <Text style={[pillStyles.countText, active && pillStyles.countTextActive]}>
          {count}
        </Text>
      </View>
    ) : null}
  </TouchableOpacity>
);

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    marginRight: Spacing.sm,
    gap: 5,
  },
  pillActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(108,99,255,0.15)',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  labelActive: {
    color: Colors.primary,
  },
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countActive: {
    backgroundColor: Colors.primary,
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  countTextActive: {
    color: Colors.white,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const SocietiesScreen: React.FC<Props> = ({ navigation }) => {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSearch = useRef('');
  const currentFilter = useRef<FilterStatus>('all');

  const fetchSocieties = useCallback(
    async (pageNum: number, searchQuery: string, statusFilter: FilterStatus, replace = false) => {
      try {
        if (pageNum === 1) {
          replace ? undefined : setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);

        const params: Record<string, unknown> = {
          page: pageNum,
          limit: PAGE_SIZE,
        };
        if (searchQuery) params.search = searchQuery;
        if (statusFilter !== 'all') params.status = statusFilter;

        const res = await societyService.getAll(params as Parameters<typeof societyService.getAll>[0]);
        const items = (res.data.data as Record<string, unknown>[] | undefined) ?? [];
        const total = (res.data as unknown as { total?: number; pagination?: { total?: number } }).total
          ?? (res.data as unknown as { pagination?: { total?: number } }).pagination?.total
          ?? 0;

        const normalised = items.map(normaliseSociety);

        setSocieties((prev) =>
          pageNum === 1 || replace ? normalised : [...prev, ...normalised],
        );
        setHasMore(normalised.length === PAGE_SIZE && societies.length + normalised.length < total);
        setPage(pageNum);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load societies';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    currentSearch.current = search;
    currentFilter.current = filter;
    fetchSocieties(1, search, filter, true);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchSocieties(1, text, currentFilter.current, true);
    }, 400);
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSocieties(1, currentSearch.current, currentFilter.current, true);
  }, [fetchSocieties]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchSocieties(page + 1, currentSearch.current, currentFilter.current, false);
  }, [fetchSocieties, hasMore, loadingMore, loading, page]);

  const handleEdit = useCallback(
    (id: string) => {
      navigation.navigate('SocietyDetail', { societyId: id });
    },
    [navigation],
  );

  const handleToggle = useCallback(
    (id: string, currentStatus: Society['status']) => {
      const action = currentStatus === 'active' ? 'deactivate' : 'activate';
      Alert.alert(
        `${action.charAt(0).toUpperCase() + action.slice(1)} Society`,
        `Are you sure you want to ${action} this society?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: action.charAt(0).toUpperCase() + action.slice(1),
            style: currentStatus === 'active' ? 'destructive' : 'default',
            onPress: async () => {
              try {
                await societyService.update(id, {
                  status: currentStatus === 'active' ? 'inactive' : 'active',
                });
                setSocieties((prev) =>
                  prev.map((s) =>
                    s._id === id
                      ? {
                          ...s,
                          status: currentStatus === 'active' ? 'inactive' : 'active',
                        }
                      : s,
                  ),
                );
              } catch {
                Alert.alert('Error', 'Failed to update society status.');
              }
            },
          },
        ],
      );
    },
    [],
  );

  const activeCounts = {
    all: societies.length,
    active: societies.filter((s) => s.status === 'active').length,
    inactive: societies.filter((s) => s.status === 'inactive').length,
  };

  const renderItem = useCallback(
    ({ item }: { item: Society }) => (
      <SocietyCard item={item} onEdit={handleEdit} onToggle={handleToggle} />
    ),
    [handleEdit, handleToggle],
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <EmptyState
        icon="business-outline"
        title="No Societies Found"
        message={
          search
            ? `No societies match "${search}"`
            : 'No societies exist yet. Create one to get started.'
        }
        actionLabel={search ? 'Clear Search' : undefined}
        onAction={search ? () => handleSearchChange('') : undefined}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Societies</Text>
        <Text style={styles.subtitle}>{societies.length} total</Text>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon
            name="search-outline"
            size={16}
            color={Colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, city, admin…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ── Filter pills ── */}
      <View style={styles.filtersRow}>
        {(['all', 'active', 'inactive'] as FilterStatus[]).map((f) => (
          <FilterPill
            key={f}
            label={f.charAt(0).toUpperCase() + f.slice(1)}
            active={filter === f}
            onPress={() => setFilter(f)}
            count={activeCounts[f]}
          />
        ))}
      </View>

      {/* ── List ── */}
      {loading && !refreshing ? (
        <LoadingSpinner message="Loading societies…" />
      ) : error && societies.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Failed to Load"
          message={error}
          actionLabel="Retry"
          onAction={handleRefresh}
        />
      ) : (
        <FlatList
          data={societies}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        />
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateSociety')}
        activeOpacity={0.85}
      >
        <Icon name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Search
  searchRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },

  // Filters
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },

  // List
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
    flexGrow: 1,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
});

export default SocietiesScreen;
