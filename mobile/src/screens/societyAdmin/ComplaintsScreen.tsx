import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FastImage from 'react-native-fast-image';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';
import { complaintService } from '@/services/api';
import { useResponsive, contentColumnStyle } from '@/utils/layout';

type ComplaintRow = {
  _id: string;
  title: string;
  description: string;
  status: string;
  category?: string;
  priority?: string;
  createdAt?: string;
  images?: { url: string }[];
  adminComments?: { comment?: string; createdAt?: string }[];
  raisedBy?: { name?: string; flatNumber?: string };
};

type ListBody = {
  data?: ComplaintRow[];
  meta?: {
    hasNextPage?: boolean;
    currentPage?: number;
  };
};

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
] as const;

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

function statusStyle(s: string) {
  switch (s) {
    case 'open':
      return { bg: `${Colors.info}33`, fg: Colors.info };
    case 'in_progress':
      return { bg: `${Colors.warning}33`, fg: Colors.warning };
    case 'resolved':
      return { bg: `${Colors.success}33`, fg: Colors.success };
    case 'closed':
      return { bg: `${Colors.textMuted}44`, fg: Colors.textMuted };
    default:
      return { bg: `${Colors.textMuted}33`, fg: Colors.textSecondary };
  }
}

function formatStatus(s: string) {
  return s.replace(/_/g, ' ');
}

const ComplaintsScreen: React.FC = () => {
  const r = useResponsive();
  const col = contentColumnStyle(r);
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState<ComplaintRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [detail, setDetail] = useState<ComplaintRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newStatus, setNewStatus] = useState<(typeof STATUSES)[number]>('open');
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPage = useCallback(
    async (p: number, append: boolean, statusKey: string) => {
      try {
        const params: { page: number; limit: number; status?: string } = {
          page: p,
          limit: 12,
        };
        if (statusKey) params.status = statusKey;
        const res = await complaintService.getAll(params);
        const body = res.data as ListBody;
        const rows = Array.isArray(body.data) ? body.data : [];
        setHasNext(!!body.meta?.hasNextPage);
        if (append) setItems((prev) => [...prev, ...rows]);
        else setItems(rows);
        setPage(p);
      } catch {
        Toast.show({ type: 'error', text1: 'Could not load complaints' });
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    void fetchPage(1, false, filter);
  }, [filter, fetchPage]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchPage(1, false, filter);
  };

  const loadMore = () => {
    if (loadingMore || loading || !hasNext) return;
    setLoadingMore(true);
    void fetchPage(page + 1, true, filter);
  };

  const openDetail = async (row: ComplaintRow) => {
    setDetail(row);
    setNewStatus(
      (STATUSES.includes(row.status as (typeof STATUSES)[number])
        ? row.status
        : 'open') as (typeof STATUSES)[number],
    );
    setAdminNote('');
    setDetailLoading(true);
    try {
      const res = await complaintService.getOne(row._id);
      const body = res.data as { data?: ComplaintRow };
      const full = body.data;
      if (full && full._id === row._id) {
        setDetail(full);
        setNewStatus(
          (STATUSES.includes(full.status as (typeof STATUSES)[number])
            ? full.status
            : 'open') as (typeof STATUSES)[number],
        );
      }
    } catch {
      /* keep list row */
    } finally {
      setDetailLoading(false);
    }
  };

  const saveStatus = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await complaintService.updateStatus(
        detail._id,
        newStatus,
        adminNote.trim() || undefined,
      );
      Toast.show({ type: 'success', text1: 'Status updated' });
      setDetail((d) =>
        d
          ? {
              ...d,
              status: newStatus,
              adminComments: adminNote.trim()
                ? [
                    ...(d.adminComments ?? []),
                    { comment: adminNote.trim(), createdAt: new Date().toISOString() },
                  ]
                : d.adminComments,
            }
          : null,
      );
      setItems((prev) =>
        prev.map((x) => (x._id === detail._id ? { ...x, status: newStatus } : x)),
      );
      setAdminNote('');
    } catch {
      Toast.show({ type: 'error', text1: 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: ComplaintRow }) => {
    const st = statusStyle(item.status);
    return (
      <TouchableOpacity
        style={[styles.card, { borderRadius: Radius.md }]}
        onPress={() => void openDetail(item)}
        activeOpacity={0.88}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { fontSize: r.h2 }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusText, { color: st.fg }]}>{formatStatus(item.status)}</Text>
          </View>
        </View>
        <Text style={[styles.byline, { fontSize: r.caption }]}>
          {item.raisedBy?.name ?? 'Resident'}
          {item.raisedBy?.flatNumber ? ` · ${item.raisedBy.flatNumber}` : ''}
        </Text>
        <Text style={[styles.preview, { fontSize: r.body }]} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={styles.metaChip}>{item.category ?? 'other'}</Text>
          <Text style={styles.metaChip}>{item.priority ?? 'medium'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, col, { paddingTop: Spacing.sm }]}>
        <Text style={[styles.screenTitle, { fontSize: r.h1 }]}>Complaints</Text>
        <Text style={[styles.subtitle, { fontSize: r.body }]}>
          Review and update resident issues
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterScroll, { paddingHorizontal: r.gutter }]}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key || 'all'}
            style={[
              styles.filterChip,
              filter === f.key && { backgroundColor: `${Colors.primary}33`, borderColor: Colors.primary },
            ]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                { fontSize: r.caption },
                filter === f.key && { color: Colors.primaryLight, fontWeight: '700' },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it._id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, col, { paddingBottom: 32 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { fontSize: r.body }]}>No complaints in this view.</Text>
          }
        />
      )}

      <Modal visible={!!detail} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !saving && !detailLoading && setDetail(null)}
          />
          <View
            style={[
              styles.detailSheet,
              {
                maxWidth: r.isTablet ? 560 : r.width - 20,
                width: r.isTablet ? Math.min(560, r.width - 48) : r.width - 20,
              },
            ]}
          >
            {detailLoading ? (
              <View style={styles.detailLoading}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {detail ? (
                <>
                  <Text style={[styles.detailTitle, { fontSize: r.h1 }]}>{detail.title}</Text>
                  <Text style={[styles.byline, { fontSize: r.body, marginTop: 6 }]}>
                    {detail.raisedBy?.name}
                    {detail.raisedBy?.flatNumber ? ` · Flat ${detail.raisedBy.flatNumber}` : ''}
                  </Text>
                  <Text style={[styles.detailBody, { fontSize: r.body }]}>{detail.description}</Text>
                  {detail.images && detail.images.length > 0 ? (
                    <View style={styles.detailImgs}>
                      {detail.images.map((im, i) => (
                        <FastImage
                          key={im.url ?? String(i)}
                          source={{ uri: im.url }}
                          style={styles.detailImg}
                          resizeMode={FastImage.resizeMode.cover}
                        />
                      ))}
                    </View>
                  ) : null}

                  <Text style={styles.sectionLabel}>New status</Text>
                  <View style={styles.wrap}>
                    {STATUSES.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.chip, newStatus === s && styles.chipOn]}
                        onPress={() => setNewStatus(s)}
                      >
                        <Text style={[styles.chipTxt, { fontSize: r.caption }, newStatus === s && styles.chipTxtOn]}>
                          {formatStatus(s)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.sectionLabel}>Note to resident (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, { fontSize: r.body }]}
                    value={adminNote}
                    onChangeText={setAdminNote}
                    placeholder="Shown in e-mail and app history"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />

                  {detail.adminComments && detail.adminComments.length > 0 ? (
                    <View style={styles.commentsBox}>
                      <Text style={styles.commentsHead}>History</Text>
                      {detail.adminComments.map((c, idx) => (
                        <View key={String(idx)} style={styles.commentRow}>
                          <Text style={[styles.commentText, { fontSize: r.body }]}>{c.comment}</Text>
                          {c.createdAt ? (
                            <Text style={styles.commentDate}>
                              {new Date(c.createdAt).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>

            <View style={styles.detailActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { minHeight: r.minTouch }]}
                onPress={() => !saving && setDetail(null)}
              >
                <Text style={styles.secondaryBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { minHeight: r.minTouch, opacity: saving ? 0.65 : 1 }]}
                onPress={() => void saveStatus()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { marginBottom: Spacing.xs },
  screenTitle: { fontWeight: '800', color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 4 },
  filterScroll: { paddingBottom: Spacing.sm, gap: 8, flexGrow: 0 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  filterChipText: { color: Colors.textSecondary },
  listContent: { flexGrow: 1, paddingTop: Spacing.xs },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: Colors.bgCard,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  cardTitle: { flex: 1, fontWeight: '700', color: Colors.textPrimary, minWidth: '40%' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  byline: { color: Colors.textMuted, marginTop: 4 },
  preview: { color: Colors.textSecondary, marginTop: Spacing.xs },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  metaChip: {
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'capitalize',
    backgroundColor: Colors.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 48 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  detailSheet: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  detailTitle: { fontWeight: '800', color: Colors.textPrimary },
  detailBody: { color: Colors.textSecondary, marginTop: Spacing.md, lineHeight: 22 },
  detailImgs: { marginTop: Spacing.md, gap: 8 },
  detailImg: { width: '100%', height: 180, borderRadius: Radius.md },
  sectionLabel: {
    marginTop: Spacing.lg,
    marginBottom: 8,
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}22` },
  chipTxt: { color: Colors.textSecondary, textTransform: 'capitalize' },
  chipTxtOn: { color: Colors.primaryLight, fontWeight: '700' },
  input: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.textPrimary,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  commentsBox: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  commentsHead: { fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  commentRow: { marginBottom: Spacing.sm },
  commentText: { color: Colors.textSecondary },
  commentDate: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  detailActions: { flexDirection: 'row', gap: 12, marginTop: Spacing.md },
  secondaryBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: Colors.textPrimary, fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: Colors.white, fontWeight: '700' },
  detailLoading: { paddingVertical: 20, alignItems: 'center' },
});

export default ComplaintsScreen;
