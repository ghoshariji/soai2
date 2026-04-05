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
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import FastImage from 'react-native-fast-image';
import { launchImageLibrary } from 'react-native-image-picker';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';
import { complaintService, getApiErrorMessage } from '@/services/api';
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
};

type ListBody = {
  success?: boolean;
  data?: ComplaintRow[];
  meta?: {
    totalPages?: number;
    currentPage?: number;
    hasNextPage?: boolean;
  };
};

const CATEGORIES = [
  'maintenance',
  'security',
  'cleanliness',
  'noise',
  'billing',
  'other',
] as const;

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

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
  const insets = useSafeAreaInsets();
  const col = contentColumnStyle(r);
  const sheetMaxHeight = Dimensions.get('window').height * 0.9;
  const formSheetWidth = Math.min(
    r.isTablet ? 520 : r.width - Spacing.md * 2,
    r.width - Spacing.sm * 2,
  );
  const detailSheetWidth = Math.min(
    r.isTablet ? 560 : r.width - Spacing.lg * 2,
    r.width - Spacing.sm * 2,
  );
  const [items, setItems] = useState<ComplaintRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('other');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('medium');
  const [imageUris, setImageUris] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<ComplaintRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    try {
      const res = await complaintService.getAll({ page: p, limit: 12 });
      const body = res.data as ListBody;
      const rows = Array.isArray(body.data) ? body.data : [];
      const meta = body.meta;
      setHasNext(!!meta?.hasNextPage);
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
  }, []);

  useEffect(() => {
    void fetchPage(1, false);
  }, [fetchPage]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchPage(1, false);
  };

  const loadMore = () => {
    if (loadingMore || loading || !hasNext) return;
    setLoadingMore(true);
    void fetchPage(page + 1, true);
  };

  const pickImages = async () => {
    if (imageUris.length >= 3) {
      Toast.show({ type: 'info', text1: 'You can attach up to 3 photos' });
      return;
    }
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 3 - imageUris.length });
    const assets = res.assets ?? [];
    setImageUris((prev) => {
      const next = [...prev];
      for (const a of assets) {
        if (a.uri && next.length < 3) {
          next.push({
            uri: a.uri,
            name: a.fileName ?? `complaint_${next.length}.jpg`,
            type: a.type ?? 'image/jpeg',
          });
        }
      }
      return next;
    });
  };

  const submitComplaint = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      Toast.show({ type: 'error', text1: 'Title and description are required' });
      return;
    }
    setSubmitting(true);
    try {
      const payload =
        imageUris.length > 0
          ? (() => {
              const form = new FormData();
              form.append('title', t);
              form.append('description', d);
              form.append('category', category);
              form.append('priority', priority);
              imageUris.forEach((img) => {
                form.append('images', {
                  uri: img.uri,
                  name: img.name,
                  type: img.type,
                } as unknown as Blob);
              });
              return form;
            })()
          : { title: t, description: d, category, priority };

      const res = await complaintService.create(payload);
      if (res.data && res.data.success === false) {
        throw new Error(
          typeof res.data.message === 'string' ? res.data.message : 'Complaint could not be submitted',
        );
      }
      Toast.show({ type: 'success', text1: 'Complaint submitted' });
      setFormOpen(false);
      setTitle('');
      setDescription('');
      setCategory('other');
      setPriority('medium');
      setImageUris([]);
      void fetchPage(1, false);
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Submit failed',
        text2: getApiErrorMessage(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (row: ComplaintRow) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      const res = await complaintService.getOne(row._id);
      const full = (res.data as unknown as { data?: ComplaintRow }).data;
      if (full && full._id === row._id) {
        setDetail(full);
      }
    } catch {
      /* list row is still shown */
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = (row: ComplaintRow) => {
    if (row.status !== 'open') {
      Toast.show({ type: 'info', text1: 'Only open complaints can be deleted' });
      return;
    }
    Alert.alert('Delete complaint', 'Remove this draft permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await complaintService.delete(row._id);
            setItems((prev) => prev.filter((x) => x._id !== row._id));
            setDetail((d) => (d?._id === row._id ? null : d));
            Toast.show({ type: 'success', text1: 'Deleted' });
          } catch {
            Toast.show({ type: 'error', text1: 'Delete failed' });
          }
        },
      },
    ]);
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
        <Text style={[styles.preview, { fontSize: r.caption }]} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={styles.metaChip}>{item.category ?? 'other'}</Text>
          <Text style={styles.metaChip}>{item.priority ?? 'medium'}</Text>
          {item.createdAt ? (
            <Text style={styles.dateText}>
              {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.headerRow, col]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.screenTitle, { fontSize: r.h1 }]}>Complaints</Text>
          <Text style={[styles.subtitle, { fontSize: r.body }]}>
            Track issues you report to the society office
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.fab, { minHeight: r.minTouch, minWidth: r.minTouch }]}
          onPress={() => setFormOpen(true)}
        >
          <Icon name="add" size={26} color={Colors.white} />
        </TouchableOpacity>
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
            <Text style={[styles.empty, { fontSize: r.body }]}>You have not raised any complaints yet.</Text>
          }
        />
      )}

      <Modal
        visible={formOpen}
        animationType="fade"
        transparent
        onRequestClose={() => !submitting && setFormOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => !submitting && setFormOpen(false)} />
            <View
              style={[
                styles.formSheet,
                {
                  maxHeight: sheetMaxHeight,
                  width: formSheetWidth,
                  maxWidth: formSheetWidth,
                  paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm,
                },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={styles.sheetScrollContent}
              >
                <Text style={[styles.formTitle, { fontSize: r.h2 }]}>New complaint</Text>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  style={[styles.input, { fontSize: r.body }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="What is the issue?"
                  placeholderTextColor={Colors.textMuted}
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                />
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { fontSize: r.body }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Details, location, time…"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                />
                <Text style={styles.label}>Category</Text>
                <View style={styles.wrap}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, category === c && styles.chipOn]}
                      onPress={() => setCategory(c)}
                    >
                      <Text style={[styles.chipTxt, { fontSize: r.caption }, category === c && styles.chipTxtOn]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Priority</Text>
                <View style={styles.wrap}>
                  {PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, priority === p && styles.chipOn]}
                      onPress={() => setPriority(p)}
                    >
                      <Text style={[styles.chipTxt, { fontSize: r.caption }, priority === p && styles.chipTxtOn]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.pickRow} onPress={pickImages}>
                  <Icon name="images-outline" size={20} color={Colors.primary} />
                  <Text style={styles.pickTxt}>Add photos ({imageUris.length}/3)</Text>
                </TouchableOpacity>
                <View style={styles.imgRow}>
                  {imageUris.map((img) => (
                    <FastImage key={img.uri} source={{ uri: img.uri }} style={styles.smallImg} />
                  ))}
                </View>
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { minHeight: r.minTouch }]}
                    onPress={() => !submitting && setFormOpen(false)}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { minHeight: r.minTouch, opacity: submitting ? 0.6 : 1 }]}
                    onPress={() => void submitComplaint()}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Submit</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!detail}
        animationType="fade"
        transparent
        onRequestClose={() => !detailLoading && setDetail(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => !detailLoading && setDetail(null)} />
            <View
              style={[
                styles.detailSheet,
                {
                  maxHeight: sheetMaxHeight,
                  width: detailSheetWidth,
                  maxWidth: detailSheetWidth,
                  paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm,
                },
              ]}
            >
              {detailLoading ? (
                <View style={styles.detailLoading}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : null}
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
                contentContainerStyle={styles.detailScrollContent}
              >
                {detail ? (
                  <>
                    <Text style={[styles.detailTitle, { fontSize: r.h1 }]}>{detail.title}</Text>
                    {(() => {
                      const st = statusStyle(detail.status);
                      return (
                        <View style={[styles.statusPill, { backgroundColor: st.bg, alignSelf: 'flex-start' }]}>
                          <Text style={[styles.statusText, { color: st.fg }]}>{formatStatus(detail.status)}</Text>
                        </View>
                      );
                    })()}
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
                    {detail.adminComments && detail.adminComments.length > 0 ? (
                      <View style={styles.commentsBox}>
                        <Text style={styles.commentsHead}>Updates from admin</Text>
                        {detail.adminComments.map((c, idx) => (
                          <View key={String(idx)} style={styles.commentRow}>
                            <Text style={[styles.commentText, { fontSize: r.body }]}>{c.comment}</Text>
                            {c.createdAt ? (
                              <Text style={styles.commentDate}>
                                {new Date(c.createdAt).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.detailActions}>
                      {detail.status === 'open' ? (
                        <TouchableOpacity
                          style={[styles.dangerBtn, { minHeight: r.minTouch }]}
                          onPress={() => confirmDelete(detail)}
                        >
                          <Text style={styles.dangerBtnText}>Delete</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.closeOnly, { minHeight: r.minTouch }]}
                        onPress={() => setDetail(null)}
                      >
                        <Text style={styles.closeOnlyText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: 12,
  },
  screenTitle: { fontWeight: '800', color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 4 },
  fab: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: Colors.bgCard,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  cardTitle: { flex: 1, fontWeight: '700', color: Colors.textPrimary, minWidth: 120 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  preview: { color: Colors.textSecondary, marginTop: Spacing.xs },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm, alignItems: 'center' },
  metaChip: {
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'capitalize',
    backgroundColor: Colors.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dateText: { fontSize: 11, color: Colors.textMuted, marginLeft: 'auto' },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 48 },
  modalRoot: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  formSheet: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    overflow: 'hidden',
  },
  sheetScrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.md,
  },
  formTitle: { fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: Spacing.sm },
  input: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.textPrimary,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
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
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
  pickTxt: { color: Colors.primary, fontWeight: '600' },
  imgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  smallImg: { width: 72, height: 72, borderRadius: Radius.sm },
  formActions: { flexDirection: 'row', gap: 12, marginTop: Spacing.lg, paddingTop: Spacing.sm },
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
  detailSheet: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    overflow: 'hidden',
  },
  detailScrollContent: {
    paddingBottom: Spacing.lg,
  },
  detailTitle: { fontWeight: '800', color: Colors.textPrimary },
  detailBody: { color: Colors.textSecondary, marginTop: Spacing.md, lineHeight: 22 },
  detailImgs: { marginTop: Spacing.md, gap: 8 },
  detailImg: { width: '100%', height: 180, borderRadius: Radius.md },
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
  detailActions: { flexDirection: 'row', gap: 12, marginTop: Spacing.lg, paddingTop: Spacing.sm },
  dangerBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: Colors.error, fontWeight: '700' },
  closeOnly: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeOnlyText: { color: Colors.white, fontWeight: '700' },
  detailLoading: { paddingVertical: 24, alignItems: 'center' },
});

export default ComplaintsScreen;
