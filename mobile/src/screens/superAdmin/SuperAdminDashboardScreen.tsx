import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Radius } from '@/theme';
import { dashboardService } from '../../services/api';
import { useAppSelector } from '../../store/index';
import Avatar from '../../components/common/Avatar';
import Badge from '../../components/common/Badge';
import Card from '../../components/common/Card';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatItem {
  label: string;
  value: string | number;
  icon: string;
  iconBg: string;
  iconColor: string;
  delta?: string;
  deltaUp?: boolean;
}

interface BarDataPoint {
  label: string;
  value: number;
}

interface RecentSociety {
  _id: string;
  name: string;
  city: string;
  status: 'active' | 'inactive' | 'pending';
  adminName: string;
  plan: string;
  createdAt: string;
  totalMembers: number;
}

interface DashboardData {
  totalSocieties: number;
  activeSocieties: number;
  totalUsers: number;
  activeSubscriptions: number;
  expiringSoon: number;
  monthlyGrowth: BarDataPoint[];
  recentSocieties: RecentSociety[];
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.lg * 2 - Spacing.sm) / 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso: string): string {
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

function normaliseDashboard(raw: Record<string, unknown>): DashboardData {
  const societies = (raw.recentSocieties as Record<string, unknown>[] | undefined) ?? [];
  const growth = (raw.monthlyGrowth as { label?: string; month?: string; value?: number; count?: number }[] | undefined) ?? [];

  return {
    totalSocieties: (raw.totalSocieties as number) ?? 0,
    activeSocieties: (raw.activeSocieties as number) ?? 0,
    totalUsers: (raw.totalUsers as number) ?? 0,
    activeSubscriptions: (raw.activeSubscriptions as number) ?? 0,
    expiringSoon: (raw.expiringSoon as number) ?? 0,
    monthlyGrowth: growth.map((g) => ({
      label: (g.label ?? g.month ?? '') as string,
      value: (g.value ?? g.count ?? 0) as number,
    })),
    recentSocieties: societies.slice(0, 5).map((s) => ({
      _id: (s._id ?? s.id ?? '') as string,
      name: (s.name ?? '') as string,
      city: (s.city ?? '') as string,
      status: (s.status ?? 'inactive') as 'active' | 'inactive' | 'pending',
      adminName: (s.adminName ?? (s.admin as Record<string, unknown>)?.name ?? 'N/A') as string,
      plan: (s.plan ?? s.subscriptionPlan ?? 'basic') as string,
      createdAt: (s.createdAt ?? '') as string,
      totalMembers: (s.totalMembers ?? s.memberCount ?? 0) as number,
    })),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  item: StatItem;
}

const StatCard: React.FC<StatCardProps> = ({ item }) => (
  <View style={[statStyles.card, { width: CARD_WIDTH }]}>
    <View style={[statStyles.iconWrap, { backgroundColor: item.iconBg }]}>
      <Icon name={item.icon} size={20} color={item.iconColor} />
    </View>
    <Text style={statStyles.value}>{formatNumber(Number(item.value))}</Text>
    <Text style={statStyles.label} numberOfLines={2}>{item.label}</Text>
    {item.delta ? (
      <View style={statStyles.deltaRow}>
        <Icon
          name={item.deltaUp ? 'trending-up' : 'trending-down'}
          size={11}
          color={item.deltaUp ? Colors.success : Colors.error}
        />
        <Text
          style={[
            statStyles.deltaText,
            { color: item.deltaUp ? Colors.success : Colors.error },
          ]}
        >
          {item.delta}
        </Text>
      </View>
    ) : null}
  </View>
);

const statStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    lineHeight: 16,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: '600',
  },
});

// ── Mini bar chart (no external library) ──────────────────────────────────

interface MiniBarChartProps {
  data: BarDataPoint[];
}

const MiniBarChart: React.FC<MiniBarChartProps> = ({ data }) => {
  if (!data.length) return null;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const CHART_HEIGHT = 80;
  const BAR_WIDTH = Math.max(
    8,
    Math.floor((width - Spacing.lg * 4) / data.length) - 6,
  );

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.barsRow}>
        {data.map((point, idx) => {
          const barH = Math.max(4, (point.value / maxVal) * CHART_HEIGHT);
          const isLast = idx === data.length - 1;
          return (
            <View key={`bar-${idx}`} style={chartStyles.barColumn}>
              <View
                style={[
                  chartStyles.bar,
                  {
                    height: barH,
                    width: BAR_WIDTH,
                    backgroundColor: isLast ? Colors.primary : 'rgba(108,99,255,0.45)',
                    borderRadius: 4,
                  },
                ]}
              />
              <Text style={chartStyles.barLabel} numberOfLines={1}>
                {point.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const chartStyles = StyleSheet.create({
  container: {
    paddingTop: Spacing.sm,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    paddingBottom: 24,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 110,
  },
  bar: {
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
    position: 'absolute',
    bottom: 0,
  },
});

// ── Recent society list item ───────────────────────────────────────────────

interface SocietyRowProps {
  item: RecentSociety;
}

const SocietyRow: React.FC<SocietyRowProps> = ({ item }) => (
  <View style={rowStyles.row}>
    <Avatar name={item.name} size="md" style={rowStyles.avatar} />
    <View style={rowStyles.info}>
      <Text style={rowStyles.name} numberOfLines={1}>{item.name}</Text>
      <View style={rowStyles.metaRow}>
        <Icon name="location-outline" size={11} color={Colors.textMuted} />
        <Text style={rowStyles.meta}>{item.city}</Text>
        <Text style={rowStyles.dot}>·</Text>
        <Text style={rowStyles.meta}>{item.adminName}</Text>
      </View>
    </View>
    <View style={rowStyles.right}>
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
      <Text style={rowStyles.date}>{formatDate(item.createdAt)}</Text>
    </View>
  </View>
);

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    marginRight: Spacing.sm,
  },
  info: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  meta: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  dot: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  date: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

const SuperAdminDashboardScreen: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await dashboardService.getSuperAdminStats();
      const raw = (res.data.data ?? {}) as Record<string, unknown>;
      setData(normaliseDashboard(raw));
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats: StatItem[] = data
    ? [
        {
          label: 'Total Societies',
          value: data.totalSocieties,
          icon: 'business-outline',
          iconBg: 'rgba(108,99,255,0.15)',
          iconColor: Colors.primary,
          delta: '+12%',
          deltaUp: true,
        },
        {
          label: 'Active Societies',
          value: data.activeSocieties,
          icon: 'checkmark-circle-outline',
          iconBg: 'rgba(16,185,129,0.15)',
          iconColor: Colors.success,
        },
        {
          label: 'Total Users',
          value: data.totalUsers,
          icon: 'people-outline',
          iconBg: 'rgba(59,130,246,0.15)',
          iconColor: '#3B82F6',
          delta: '+8%',
          deltaUp: true,
        },
        {
          label: 'Active Subscriptions',
          value: data.activeSubscriptions,
          icon: 'card-outline',
          iconBg: 'rgba(245,158,11,0.15)',
          iconColor: Colors.warning,
        },
        {
          label: 'Expiring Soon',
          value: data.expiringSoon,
          icon: 'time-outline',
          iconBg: 'rgba(239,68,68,0.15)',
          iconColor: Colors.error,
        },
      ]
    : [];

  if (loading) {
    return <LoadingSpinner message="Loading dashboard…" />;
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Failed to Load"
          message={error}
          actionLabel="Retry"
          onAction={() => fetchDashboard()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDashboard(true)}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Good{getGreeting()},</Text>
            <Text style={styles.adminName} numberOfLines={1}>
              {user?.name ?? 'Super Admin'}
            </Text>
          </View>
          <Avatar
            name={user?.name ?? 'SA'}
            uri={user?.profilePhoto}
            size="md"
          />
        </View>

        {/* ── Stats grid ── */}
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsGrid}>
          {stats.map((stat, idx) => (
            <StatCard key={idx} item={stat} />
          ))}
        </View>

        {/* ── Monthly Growth Chart ── */}
        {data?.monthlyGrowth && data.monthlyGrowth.length > 0 ? (
          <Card style={styles.chartCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Monthly Growth</Text>
              <View style={styles.chartLegend}>
                <View style={styles.legendDot} />
                <Text style={styles.legendText}>New Societies</Text>
              </View>
            </View>
            <MiniBarChart data={data.monthlyGrowth} />
          </Card>
        ) : null}

        {/* ── Recent Societies ── */}
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Recent Societies</Text>
        </View>
        {data?.recentSocieties && data.recentSocieties.length > 0 ? (
          <Card style={styles.listCard}>
            {data.recentSocieties.map((society, idx) => (
              <React.Fragment key={society._id}>
                <SocietyRow item={society} />
                {idx === data.recentSocieties.length - 1 ? null : null}
              </React.Fragment>
            ))}
          </Card>
        ) : (
          <Card style={styles.listCard}>
            <Text style={styles.emptyText}>No societies found.</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return ' morning';
  if (h < 17) return ' afternoon';
  return ' evening';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  greeting: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '400',
  },
  adminName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },

  // Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    letterSpacing: 0.1,
  },

  // Stats grid: 2-column wrap
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },

  // Chart card
  chartCard: {
    marginBottom: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  legendText: {
    fontSize: 11,
    color: Colors.textMuted,
  },

  // List card
  listCard: {
    padding: Spacing.md,
    paddingBottom: 0,
    marginBottom: Spacing.lg,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
});

export default SuperAdminDashboardScreen;
