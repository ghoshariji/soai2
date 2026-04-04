import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSelector } from 'react-redux';
import { dashboardService } from '../../services/api';
import { Colors, Spacing, Radius } from '@/theme';
import Badge from '@/components/common/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatCard {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  bg: string;
}

interface Complaint {
  _id: string;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  category: string;
  raisedBy: { name: string; flatNumber?: string };
  createdAt: string;
}

interface Announcement {
  _id: string;
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
}

interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  openComplaints: number;
  totalGroups: number;
  totalAnnouncements: number;
  resolvedComplaints: number;
  recentComplaints: Complaint[];
  recentAnnouncements: Announcement[];
  societyName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(
  status: string,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'open':
      return 'error';
    case 'in_progress':
      return 'warning';
    case 'resolved':
    case 'closed':
      return 'success';
    default:
      return 'default';
  }
}

function priorityVariant(
  priority: string,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (priority) {
    case 'urgent':
      return 'error';
    case 'high':
      return 'warning';
    case 'normal':
      return 'info';
    case 'low':
      return 'success';
    default:
      return 'default';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatCardItem: React.FC<StatCard> = ({ label, value, icon, color, bg }) => (
  <View style={[styles.statCard, { borderColor: `${color}33` }]}>
    <View style={[styles.statIconBox, { backgroundColor: bg }]}>
      <Icon name={icon} size={22} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const DashboardScreen: React.FC = () => {
  const user = useSelector((state: any) => state.auth.user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const societyId = user?.societyId ?? '';
      const res = await dashboardService.getSocietyAdminStats(societyId);
      const raw = res.data.data as Record<string, unknown>;
      setData({
        totalUsers: (raw.totalUsers as number) ?? 0,
        activeUsers: (raw.activeUsers as number) ?? 0,
        openComplaints: (raw.openComplaints as number) ?? 0,
        totalGroups: (raw.totalGroups as number) ?? 0,
        totalAnnouncements: (raw.totalAnnouncements as number) ?? 0,
        resolvedComplaints: (raw.resolvedComplaints as number) ?? 0,
        recentComplaints: (raw.recentComplaints as Complaint[]) ?? [],
        recentAnnouncements: (raw.recentAnnouncements as Announcement[]) ?? [],
        societyName: (raw.societyName as string) ?? undefined,
      });
    } catch {
      setError('Failed to load dashboard. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.societyId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard();
  }, [fetchDashboard]);

  const stats: StatCard[] = data
    ? [
        {
          label: 'Total Users',
          value: data.totalUsers,
          icon: 'people-outline',
          color: Colors.primary,
          bg: 'rgba(108,99,255,0.15)',
        },
        {
          label: 'Active Users',
          value: data.activeUsers,
          icon: 'person-check-outline',
          color: Colors.success,
          bg: 'rgba(16,185,129,0.15)',
        },
        {
          label: 'Open Complaints',
          value: data.openComplaints,
          icon: 'warning-outline',
          color: Colors.error,
          bg: 'rgba(239,68,68,0.15)',
        },
        {
          label: 'Groups',
          value: data.totalGroups,
          icon: 'chatbubbles-outline',
          color: Colors.info,
          bg: 'rgba(59,130,246,0.15)',
        },
        {
          label: 'Announcements',
          value: data.totalAnnouncements,
          icon: 'megaphone-outline',
          color: Colors.warning,
          bg: 'rgba(245,158,11,0.15)',
        },
        {
          label: 'Resolved',
          value: data.resolvedComplaints,
          icon: 'checkmark-circle-outline',
          color: Colors.success,
          bg: 'rgba(16,185,129,0.15)',
        },
      ]
    : [];

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <Text style={styles.headerSub}>
              Welcome back,{' '}
              <Text style={styles.headerName}>{user?.name ?? 'Admin'}</Text>
            </Text>
            {data?.societyName ? (
              <Text style={styles.societyName}>{data.societyName}</Text>
            ) : null}
          </View>
          <View style={styles.headerIcon}>
            <Icon name="shield-checkmark" size={28} color={Colors.primary} />
          </View>
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Icon name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <StatCardItem key={s.label} {...s} />
          ))}
        </View>

        {/* Recent Complaints */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Complaints</Text>
          <Icon name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
        {data?.recentComplaints.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon
              name="checkmark-done-outline"
              size={32}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyText}>No recent complaints</Text>
          </View>
        ) : (
          data?.recentComplaints.slice(0, 3).map((c) => (
            <View key={c._id} style={styles.listCard}>
              <View style={styles.listCardLeft}>
                <Text style={styles.listCardTitle} numberOfLines={1}>
                  {c.title}
                </Text>
                <Text style={styles.listCardSub} numberOfLines={1}>
                  {c.raisedBy?.name}
                  {c.raisedBy?.flatNumber ? ` · Flat ${c.raisedBy.flatNumber}` : ''}
                </Text>
                <Text style={styles.listCardDate}>{formatDate(c.createdAt)}</Text>
              </View>
              <View style={styles.listCardRight}>
                <Badge
                  label={c.status.replace('_', ' ')}
                  variant={statusVariant(c.status)}
                  size="sm"
                />
                <Badge
                  label={c.category}
                  variant="default"
                  size="sm"
                />
              </View>
            </View>
          ))
        )}

        {/* Recent Announcements */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Announcements</Text>
          <Icon name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
        {data?.recentAnnouncements.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon
              name="megaphone-outline"
              size={32}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyText}>No recent announcements</Text>
          </View>
        ) : (
          data?.recentAnnouncements.slice(0, 3).map((a) => (
            <View key={a._id} style={styles.listCard}>
              <View style={styles.listCardLeft}>
                <Text style={styles.listCardTitle} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={styles.listCardSub} numberOfLines={2}>
                  {a.description}
                </Text>
                <Text style={styles.listCardDate}>{formatDate(a.createdAt)}</Text>
              </View>
              <Badge
                label={a.priority}
                variant={priorityVariant(a.priority)}
                size="sm"
              />
            </View>
          ))
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  centered: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.lg,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerName: {
    color: Colors.primary,
    fontWeight: '600',
  },
  societyName: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(108,99,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, fontSize: 13, flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    letterSpacing: 0.2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 4,
  },
  statCard: {
    width: '47.5%',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  listCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  listCardLeft: { flex: 1, gap: 3 },
  listCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  listCardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  listCardDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  listCardRight: { gap: 4, alignItems: 'flex-end' },
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  emptyText: { fontSize: 13, color: Colors.textMuted },
  bottomPad: { height: Spacing.xxl },
});

export default DashboardScreen;
