import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  subscriptionService,
  getApiErrorMessage,
  type PaginatedResponse,
} from '@/services/api';
import Badge from '@/components/common/Badge';
import Card from '@/components/common/Card';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import { Colors, Spacing, Typography, Radius } from '@/theme';
import { notify } from '@/utils/toast';

interface Subscription {
  _id: string;
  society?: { _id: string; name: string; city?: string };
  plan: string;
  expiryDate: string;
  status: string;
  daysRemaining: number;
  computedStatus?: string;
  features?: Record<string, unknown>;
  price?: number;
}

const SubscriptionScreen: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [newPlan, setNewPlan] = useState('basic');
  const [newExpiry, setNewExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSubs = useCallback(async (p = 1, refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      const res = await subscriptionService.getAll({ page: p, limit: 20 });
      const body = res.data as PaginatedResponse<Subscription>;
      if (body.success === false) {
        throw new Error(body.message || 'Failed to load subscriptions');
      }
      const rows = Array.isArray(body.data) ? body.data : [];
      if (p === 1) setSubscriptions(rows);
      else setSubscriptions((prev) => [...prev, ...rows]);
      const hasNext = body.meta?.hasNextPage ?? false;
      setHasMore(hasNext);
      setPage(p);
    } catch (e) {
      if (p === 1) setSubscriptions([]);
      notify.error('Failed to load subscriptions', getApiErrorMessage(e));
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSubs(1); }, [fetchSubs]);

  const openEdit = (sub: Subscription) => {
    setSelectedSub(sub);
    setNewPlan(sub.plan);
    const iso = sub.expiryDate ? String(sub.expiryDate).split('T')[0] : '';
    setNewExpiry(iso);
    setEditModal(true);
  };

  const handleSave = async () => {
    if (!selectedSub?.society?._id) {
      notify.error('Missing society', 'This subscription has no linked society.');
      return;
    }
    const trimmed = newExpiry.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      notify.error('Invalid date', 'Use expiry as YYYY-MM-DD.');
      return;
    }
    const expiryIso = `${trimmed}T23:59:59.999Z`;

    setSaving(true);
    try {
      await subscriptionService.update(String(selectedSub.society._id), {
        plan: newPlan,
        expiryDate: expiryIso,
      });
      notify.success('Subscription updated', 'Changes saved successfully.');
      setEditModal(false);
      fetchSubs(1, false);
    } catch (err) {
      notify.error('Update failed', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const getDaysVariant = (days: number): 'success' | 'warning' | 'error' => {
    if (days > 30) return 'success';
    if (days > 7) return 'warning';
    return 'error';
  };

  const renderItem = ({ item }: { item: Subscription }) => {
    const days = item.daysRemaining;
    const expired =
      item.computedStatus === 'expired' ||
      item.status === 'expired' ||
      days <= 0;

    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.flex}>
            <Text style={styles.societyName}>{item.society?.name ?? 'Society'}</Text>
            <Text style={styles.city}>{item.society?.city ?? ''}</Text>
          </View>
          <Badge label={(item.plan ?? '—').toUpperCase()} variant="info" />
        </View>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Expiry</Text>
            <Text style={styles.value}>{new Date(item.expiryDate).toLocaleDateString()}</Text>
          </View>
          <View>
            <Text style={styles.label}>Days Left</Text>
            <Badge
              label={expired ? 'EXPIRED' : `${days} days`}
              variant={expired ? 'error' : getDaysVariant(days)}
            />
          </View>
          <View>
            <Text style={styles.label}>Status</Text>
            <Badge
              label={(item.status ?? '—').toUpperCase()}
              variant={item.status === 'active' ? 'success' : 'error'}
            />
          </View>
        </View>
        <Button title="Edit Subscription" variant="outline" size="sm" onPress={() => openEdit(item)} style={styles.editBtn} />
      </Card>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Subscriptions" subtitle={`${subscriptions.length} total`} />
      <FlatList
        data={subscriptions}
        keyExtractor={(item, index) =>
          item._id != null && item._id !== ''
            ? String(item._id)
            : `sub-${item.society?._id ?? index}`
        }
        renderItem={renderItem}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchSubs(1, true)}
            tintColor={Colors.primary}
          />
        }
        onEndReached={() => hasMore && fetchSubs(page + 1)}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <EmptyState title="No Subscriptions" message="No subscriptions found" />
        }
      />

      <Modal visible={editModal} animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Subscription</Text>
            <Text style={styles.label}>Plan</Text>
            <View style={styles.planRow}>
              {['basic', 'premium', 'custom'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.planBtn, newPlan === p && styles.planBtnActive]}
                  onPress={() => setNewPlan(p)}
                >
                  <Text style={[styles.planBtnText, newPlan === p && styles.planBtnTextActive]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { marginTop: Spacing.md }]}>Expiry Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={newExpiry}
              onChangeText={setNewExpiry}
              placeholder="2026-12-31"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.modalBtns}>
              <Button title="Cancel" variant="ghost" onPress={() => setEditModal(false)} style={styles.flex} />
              <Button title="Save" loading={saving} onPress={handleSave} style={styles.flex} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  flex: { flex: 1 },
  list: { padding: Spacing.md, paddingBottom: Spacing.xl },
  card: { marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  societyName: { ...Typography.h4, color: Colors.textPrimary },
  city: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  label: { ...Typography.label, color: Colors.textMuted, marginBottom: 4 },
  value: { ...Typography.body2, color: Colors.textPrimary },
  editBtn: { marginTop: Spacing.xs },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
  },
  modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.lg },
  planRow: { flexDirection: 'row', gap: Spacing.sm },
  planBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  planBtnActive: { borderColor: Colors.primary, backgroundColor: 'rgba(108,99,255,0.12)' },
  planBtnText: { ...Typography.body2, color: Colors.textSecondary },
  planBtnTextActive: { color: Colors.primary, fontWeight: '700' },
  input: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.md, color: Colors.textPrimary,
    ...Typography.body1, marginBottom: Spacing.sm,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});

export default SubscriptionScreen;
