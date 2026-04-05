import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Radius } from '@/theme';
import { dashboardService } from '@/services/api';
import Card from '@/components/common/Card';

const { width } = Dimensions.get('window');

interface BarPoint {
  label: string;
  value: number;
}

function mapSeries(
  raw: { label?: string; month?: string; value?: number; count?: number }[] | undefined,
): BarPoint[] {
  const arr = raw ?? [];
  return arr.map((g) => ({
    label: String(g.label ?? g.month ?? ''),
    value: Number(g.value ?? g.count ?? 0),
  }));
}

function normalise(raw: Record<string, unknown> | null | undefined) {
  const rawObj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const soc = rawObj.societies as Record<string, number> | undefined;
  const usr = rawObj.users as Record<string, number> | undefined;
  const sub = rawObj.subscriptions as Record<string, number> | undefined;
  return {
    totalSocieties: soc?.total ?? (rawObj.totalSocieties as number) ?? 0,
    activeSocieties: soc?.active ?? (rawObj.activeSocieties as number) ?? 0,
    totalUsers: usr?.total ?? (rawObj.totalUsers as number) ?? 0,
    activeUsers: usr?.active ?? 0,
    activeSubscriptions: sub?.active ?? (rawObj.activeSubscriptions as number) ?? 0,
    expiredSubscriptions: sub?.expired ?? 0,
    expiringSoon: sub?.expiringSoon ?? (rawObj.expiringSoon as number) ?? 0,
    monthlyGrowth: mapSeries(
      rawObj.monthlyGrowth as Parameters<typeof mapSeries>[0],
    ),
    userActivity: mapSeries(
      rawObj.userActivity as Parameters<typeof mapSeries>[0],
    ),
  };
}

const EMPTY_ANALYTICS = normalise({});

const MiniBarChart: React.FC<{ data: BarPoint[]; accent?: string }> = ({
  data,
  accent = Colors.primary,
}) => {
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
                    backgroundColor: isLast ? accent : `${accent}73`,
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

const AnalyticsScreen: React.FC = () => {
  const [data, setData] = useState<ReturnType<typeof normalise>>(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const res = await dashboardService.getSuperAdminStats();
      const payload = res.data?.data;
      setData(
        normalise(
          payload && typeof payload === 'object'
            ? (payload as Record<string, unknown>)
            : null,
        ),
      );
    } catch {
      setError('Could not load analytics. Pull to retry.');
      setData(EMPTY_ANALYTICS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const d = data;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.sub}>Platform trends (same source as dashboard)</Text>
      </View>
      {error ? (
        <View style={styles.errorBanner}>
          <Icon name="alert-circle-outline" size={18} color={Colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.kpiRow}>
          <Kpi icon="business-outline" label="Societies" value={String(d.totalSocieties)} sub={`${d.activeSocieties} active`} />
          <Kpi icon="people-outline" label="Users" value={String(d.totalUsers)} sub={`${d.activeUsers} active`} />
        </View>
        <View style={styles.kpiRow}>
          <Kpi icon="card-outline" label="Subscriptions" value={String(d.activeSubscriptions)} sub={`${d.expiredSubscriptions} expired`} />
          <Kpi icon="time-outline" label="Expiring (7d)" value={String(d.expiringSoon)} sub="Renew in Billing tab" />
        </View>

        {d.monthlyGrowth.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>New societies by month</Text>
            <MiniBarChart data={d.monthlyGrowth} />
          </Card>
        ) : null}

        {d.userActivity.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Active users (by period)</Text>
            <MiniBarChart data={d.userActivity} accent={Colors.success} />
          </Card>
        ) : null}

        {!d.monthlyGrowth.length && !d.userActivity.length ? (
          <Text style={styles.empty}>No time-series data yet. Open the Dashboard tab after societies have activity.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

function Kpi(props: { icon: string; label: string; value: string; sub: string }) {
  return (
    <View style={kpiStyles.box}>
      <Icon name={props.icon} size={22} color={Colors.primary} />
      <Text style={kpiStyles.val}>{props.value}</Text>
      <Text style={kpiStyles.lab}>{props.label}</Text>
      <Text style={kpiStyles.sub}>{props.sub}</Text>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginHorizontal: 4,
  },
  val: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginTop: 8 },
  lab: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginTop: 4 },
  sub: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});

const chartStyles = StyleSheet.create({
  container: { paddingTop: Spacing.sm },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    paddingBottom: 24,
  },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 110 },
  bar: { marginBottom: 4 },
  barLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
    position: 'absolute',
    bottom: 0,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 40 },
  kpiRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: Spacing.xl, paddingHorizontal: Spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  errorText: { flex: 1, color: Colors.warning, fontSize: 14 },
});

export default AnalyticsScreen;
