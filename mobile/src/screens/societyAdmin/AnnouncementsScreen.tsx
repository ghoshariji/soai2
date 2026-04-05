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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import FastImage from 'react-native-fast-image';
import { launchImageLibrary } from 'react-native-image-picker';
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
  readCount?: number;
  createdBy?: { name?: string };
};

type ListPayload = {
  announcements?: AnnItem[];
  total?: number;
  page?: number;
  pages?: number;
};

const PRIORITIES = ['normal', 'important', 'urgent'] as const;

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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AnnItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('normal');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageName, setImageName] = useState('announcement.jpg');
  const [imageType, setImageType] = useState('image/jpeg');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setPriority('normal');
    setImageUri(null);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (row: AnnItem) => {
    setEditing(row);
    setTitle(row.title);
    setDescription(row.description);
    setPriority(
      (PRIORITIES.includes(row.priority as (typeof PRIORITIES)[number])
        ? row.priority
        : 'normal') as (typeof PRIORITIES)[number],
    );
    setImageUri(null);
    setFormOpen(true);
  };

  const pickImage = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    const a = res.assets?.[0];
    if (a?.uri) {
      setImageUri(a.uri);
      setImageName(a.fileName ?? 'announcement.jpg');
      setImageType(a.type ?? 'image/jpeg');
    }
  };

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    try {
      const res = await announcementService.getAll({ page: p, limit: 15 });
      const body = res.data as { success?: boolean; data?: ListPayload };
      const payload = body.data ?? {};
      const next = payload.announcements ?? [];
      setPages(payload.pages ?? 1);
      if (append) setItems((prev) => [...prev, ...next]);
      else setItems(next);
      setPage(p);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load announcements' });
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

  const submitForm = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      Toast.show({ type: 'error', text1: 'Title and description are required' });
      return;
    }
    setSaving(true);
    try {
      const payload =
        imageUri != null
          ? (() => {
              const form = new FormData();
              form.append('title', t);
              form.append('description', d);
              form.append('priority', priority);
              form.append('image', {
                uri: imageUri,
                name: imageName,
                type: imageType,
              } as unknown as Blob);
              return form;
            })()
          : { title: t, description: d, priority };

      if (editing) {
        await announcementService.update(editing._id, payload);
        Toast.show({ type: 'success', text1: 'Announcement updated' });
      } else {
        await announcementService.create(payload);
        Toast.show({ type: 'success', text1: 'Announcement published' });
      }
      setFormOpen(false);
      resetForm();
      void fetchPage(1, false);
    } catch {
      Toast.show({ type: 'error', text1: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (row: AnnItem) => {
    Alert.alert('Delete announcement', `"${row.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await announcementService.delete(row._id);
            setItems((prev) => prev.filter((x) => x._id !== row._id));
            Toast.show({ type: 'success', text1: 'Deleted' });
          } catch {
            Toast.show({ type: 'error', text1: 'Delete failed' });
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: AnnItem }) => (
    <View style={[styles.card, { borderRadius: Radius.md }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { fontSize: r.h2 }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => openEdit(item)} hitSlop={10}>
            <Icon name="create-outline" size={22} color={Colors.primaryLight} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={10}>
            <Icon name="trash-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[styles.pill, { backgroundColor: `${priorityColor(item.priority)}33`, alignSelf: 'flex-start' }]}
      >
        <Text style={[styles.pillText, { color: priorityColor(item.priority) }]}>
          {(item.priority ?? 'normal').replace('_', ' ')}
        </Text>
      </View>
      {item.image ? (
        <FastImage
          source={{ uri: item.image }}
          style={styles.thumb}
          resizeMode={FastImage.resizeMode.cover}
        />
      ) : null}
      <Text style={[styles.preview, { fontSize: r.body }]} numberOfLines={3}>
        {item.description}
      </Text>
      <Text style={styles.meta}>
        {typeof item.readCount === 'number' ? `${item.readCount} reads · ` : ''}
        {item.createdAt
          ? new Date(item.createdAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : ''}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.headerRow, col]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.screenTitle, { fontSize: r.h1 }]}>Announcements</Text>
          <Text style={[styles.subtitle, { fontSize: r.body }]}>
            Create and manage society notices
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.fab, { minHeight: r.minTouch, minWidth: r.minTouch }]}
          onPress={openCreate}
          activeOpacity={0.85}
        >
          <Icon name="add" size={28} color={Colors.white} />
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
            <Text style={[styles.empty, { fontSize: r.body }]}>No announcements yet.</Text>
          }
        />
      )}

      <Modal visible={formOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !saving && setFormOpen(false)} />
          <View
            style={[
              styles.formSheet,
              {
                maxWidth: r.isTablet ? 520 : r.width - 16,
                width: r.isTablet ? Math.min(520, r.width - 48) : r.width - 16,
              },
            ]}
          >
            <Text style={[styles.formTitle, { fontSize: r.h2 }]}>
              {editing ? 'Edit announcement' : 'New announcement'}
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={[styles.input, { fontSize: r.body }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Short headline"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { fontSize: r.body }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Full message for residents"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <Text style={styles.label}>Priority</Text>
              <View style={styles.priorityRow}>
                {PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.chip,
                      priority === p && { borderColor: Colors.primary, backgroundColor: `${Colors.primary}22` },
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { fontSize: r.caption },
                        priority === p && { color: Colors.primaryLight, fontWeight: '700' },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.pickImg} onPress={pickImage}>
                <Icon name="image-outline" size={20} color={Colors.primary} />
                <Text style={styles.pickImgText}>
                  {imageUri ? 'Change image' : editing?.image ? 'Replace image (optional)' : 'Add image (optional)'}
                </Text>
              </TouchableOpacity>
              {imageUri ? (
                <FastImage source={{ uri: imageUri }} style={styles.previewImg} resizeMode={FastImage.resizeMode.cover} />
              ) : editing?.image && !imageUri ? (
                <FastImage
                  source={{ uri: editing.image }}
                  style={styles.previewImg}
                  resizeMode={FastImage.resizeMode.cover}
                />
              ) : null}
            </ScrollView>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { minHeight: r.minTouch }]}
                onPress={() => {
                  if (!saving) {
                    setFormOpen(false);
                    resetForm();
                  }
                }}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { minHeight: r.minTouch, opacity: saving ? 0.6 : 1 }]}
                onPress={() => void submitForm()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>{editing ? 'Save' : 'Publish'}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
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
  listContent: { flexGrow: 1, paddingTop: Spacing.xs },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: Colors.bgCard,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  cardTitle: { flex: 1, fontWeight: '700', color: Colors.textPrimary },
  cardActions: { flexDirection: 'row', gap: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: Spacing.xs },
  pillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  thumb: { width: '100%', height: 120, borderRadius: Radius.sm, marginTop: Spacing.sm },
  preview: { color: Colors.textSecondary, marginTop: Spacing.sm },
  meta: { color: Colors.textMuted, fontSize: 12, marginTop: Spacing.xs },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 48 },
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
    padding: Spacing.lg,
    maxHeight: '90%',
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
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: { color: Colors.textSecondary, textTransform: 'capitalize' },
  pickImg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  pickImgText: { color: Colors.primary, fontWeight: '600' },
  previewImg: {
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  formActions: { flexDirection: 'row', gap: 12, marginTop: Spacing.lg },
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
});

export default AnnouncementsScreen;
