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
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FastImage from 'react-native-fast-image';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';
import { announcementService } from '@/services/api';
import { useResponsive, contentColumnStyle } from '@/utils/layout';

type AnnItem = {
  _id: string;
  title: string;
  description: string;
  image?: string;
  priority?: string;
  createdAt?: string;
  isRead?: boolean;
  createdBy?: { name?: string };
};

type ListPayload = {
  announcements?: AnnItem[];
  total?: number;
  page?: number;
  pages?: number;
};

function priorityColor(p?: string) {
  if (p === 'urgent') return Colors.error;
  if (p === 'important') return Colors.warning;
  return Colors.info;
}

const AnnouncementsScreen: React.FC = () => {
  const r = useResponsive();
  const col = contentColumnStyle(r);
  const [items, setItems] = useState<AnnItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<AnnItem | null>(null);

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    try {
      const res = await announcementService.getAll({ page: p, limit: 15 });
      const body = res.data as { success?: boolean; data?: ListPayload };
      const payload = body.data ?? {};
      const next = payload.announcements ?? [];
      setPages(payload.pages ?? 1);
      if (append) {
        setItems((prev) => [...prev, ...next]);
      } else {
        setItems(next);
      }
      setPage(p);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : 'Could not load announcements';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(1, false);
  }, [fetchPage]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchPage(1, false);
  };

  const loadMore = () => {
    if (loadingMore || loading || page >= pages) return;
    setLoadingMore(true);
    void fetchPage(page + 1, true);
  };

  const openDetail = (row: AnnItem) => {
    setSelected(row);
    if (!row.isRead) {
      announcementService
        .markAsRead(row._id)
        .then(() => {
          setItems((prev) =>
            prev.map((a) => (a._id === row._id ? { ...a, isRead: true } : a)),
          );
          setSelected((s) => (s && s._id === row._id ? { ...s, isRead: true } : s));
        })
        .catch(() => {});
    }
  };

  const renderItem = ({ item }: { item: AnnItem }) => (
    <TouchableOpacity
      style={[styles.card, { borderRadius: Radius.md }]}
      onPress={() => openDetail(item)}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        {!item.isRead && <View style={styles.unreadDot} />}
        <Text style={[styles.cardTitle, { fontSize: r.h2 }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View
          style={[
            styles.pill,
            { backgroundColor: `${priorityColor(item.priority)}33` },
          ]}
        >
          <Text style={[styles.pillText, { color: priorityColor(item.priority) }]}>
            {(item.priority ?? 'normal').replace('_', ' ')}
          </Text>
        </View>
      </View>
      {item.image ? (
        <FastImage
          source={{ uri: item.image }}
          style={styles.thumb}
          resizeMode={FastImage.resizeMode.cover}
        />
      ) : null}
      <Text style={[styles.preview, { fontSize: r.caption }]} numberOfLines={2}>
        {item.description}
      </Text>
      <Text style={styles.meta}>
        {item.createdBy?.name ? `${item.createdBy.name} · ` : ''}
        {item.createdAt
          ? new Date(item.createdAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : ''}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, col, { paddingTop: Spacing.sm }]}>
        <Text style={[styles.screenTitle, { fontSize: r.h1 }]}>Announcements</Text>
        <Text style={[styles.subtitle, { fontSize: r.body }]}>
          Society notices and updates
        </Text>
      </View>

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
            <Text style={[styles.empty, { fontSize: r.body }]}>
              No announcements yet.
            </Text>
          }
        />
      )}

      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View
            style={[
              styles.modalSheet,
              {
                maxWidth: r.isTablet ? 560 : r.width - 24,
                width: r.isTablet ? Math.min(560, r.width - 48) : r.width - 24,
              },
            ]}
          >
            <View style={styles.modalGrab}>
              <View style={styles.grabBar} />
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {selected?.image ? (
                <FastImage
                  source={{ uri: selected.image }}
                  style={styles.modalImage}
                  resizeMode={FastImage.resizeMode.cover}
                />
              ) : null}
              <Text style={[styles.modalTitle, { fontSize: r.h1 }]}>{selected?.title}</Text>
              <View style={styles.modalMetaRow}>
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: `${priorityColor(selected?.priority)}33` },
                  ]}
                >
                  <Text
                    style={[styles.pillText, { color: priorityColor(selected?.priority) }]}
                  >
                    {(selected?.priority ?? 'normal').replace('_', ' ')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.modalBody, { fontSize: r.body }]}>
                {selected?.description}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.closeBtn, { minHeight: r.minTouch }]}
              onPress={() => setSelected(null)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { marginBottom: Spacing.sm },
  screenTitle: { fontWeight: '800', color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 4 },
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  cardTitle: { flex: 1, fontWeight: '700', color: Colors.textPrimary, minWidth: '50%' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  thumb: { width: '100%', height: 140, borderRadius: Radius.sm, marginTop: Spacing.sm },
  preview: { color: Colors.textSecondary, marginTop: Spacing.xs },
  meta: { color: Colors.textMuted, fontSize: 12, marginTop: Spacing.xs },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 48 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalSheet: {
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  modalGrab: { alignItems: 'center', paddingVertical: 10 },
  grabBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  modalScroll: { paddingHorizontal: Spacing.lg },
  modalImage: { width: '100%', height: 200, borderRadius: Radius.md, marginBottom: Spacing.md },
  modalTitle: { fontWeight: '800', color: Colors.textPrimary },
  modalMetaRow: { flexDirection: 'row', marginTop: Spacing.sm },
  modalBody: { color: Colors.textSecondary, marginTop: Spacing.md, lineHeight: 22 },
  closeBtn: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
});

export default AnnouncementsScreen;
