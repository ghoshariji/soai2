import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';

import { Colors, Spacing, Radius } from '@/theme';
import { groupService } from '@/services/api';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import type { CommunityStackParamList } from '@/navigation/SocietyAdminNavigator';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'Groups'>;

interface GroupItem {
  _id: string;
  name?: string;
  description?: string;
  memberCount?: number;
}

function normaliseGroupRow(raw: Record<string, unknown>): GroupItem | null {
  const id = raw._id ?? raw.id;
  if (id == null || id === '') return null;
  const memberCount =
    typeof raw.memberCount === 'number'
      ? raw.memberCount
      : Array.isArray(raw.members)
        ? raw.members.length
        : undefined;
  return {
    _id: String(id),
    name: typeof raw.name === 'string' ? raw.name : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    memberCount,
  };
}

function parseGroupListResponse(res: { data?: unknown }): GroupItem[] {
  const envelope = res.data as Record<string, unknown> | undefined;
  if (!envelope || typeof envelope !== 'object') return [];
  const inner = envelope.data;
  if (!Array.isArray(inner)) return [];
  return inner
    .map((row) =>
      row && typeof row === 'object'
        ? normaliseGroupRow(row as Record<string, unknown>)
        : null,
    )
    .filter((g): g is GroupItem => g != null);
}

const GroupsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  /** Reserve space so Cancel/Create are never clipped (ScrollView is capped; sheet is not forced to full screen height). */
  const createSheetMetrics = useMemo(() => {
    const h = Dimensions.get('window').height;
    const maxSheet = Math.round(Math.min(h * 0.88, h - insets.top - Spacing.md * 2));
    const footerReserve = 155;
    const scrollMax = Math.max(200, maxSheet - footerReserve);
    return { maxSheet, scrollMax };
  }, [insets.top]);
  const [list, setList] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await groupService.getAll({ page: 1, limit: 100 });
      setList(parseGroupListResponse(res));
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load groups' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createGroup = async () => {
    if (gName.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'Name at least 2 characters' });
      return;
    }
    setCreating(true);
    try {
      const res = await groupService.create({
        name: gName.trim(),
        description: gDesc.trim(),
      });
      const createdRaw = (res.data as { data?: Record<string, unknown> }).data;
      const optimistic =
        createdRaw && typeof createdRaw === 'object'
          ? normaliseGroupRow(createdRaw)
          : null;
      Toast.show({ type: 'success', text1: 'Group created' });
      setModal(false);
      setGName('');
      setGDesc('');
      if (optimistic) {
        setList((prev) => {
          if (prev.some((p) => p._id === optimistic._id)) return prev;
          return [optimistic, ...prev];
        });
      }
      await load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { message?: string } } }).response?.data
                ?.message ?? '',
            )
          : 'Create failed';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.safe}>
        <Header
          title="Community groups"
          showBack
          rightAction={{
            icon: 'newspaper-outline',
            onPress: () => navigation.navigate('Feed'),
          }}
        />
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Header
        title="Community groups"
        showBack
        rightAction={{
          icon: 'newspaper-outline',
          onPress: () => navigation.navigate('Feed'),
        }}
      />
      <TouchableOpacity style={styles.createBar} onPress={() => setModal(true)} activeOpacity={0.85}>
        <Icon name="add-circle-outline" size={22} color={Colors.primary} />
        <Text style={styles.createBarText}>Create group</Text>
      </TouchableOpacity>

      <FlatList
        data={list}
        extraData={list}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No groups yet"
            message="Create a group for residents to join and chat."
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              navigation.navigate('GroupDetail', {
                groupId: item._id,
                name: item.name,
              })
            }
          >
            <View style={styles.cardIcon}>
              <Icon name="people" size={22} color={Colors.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={styles.cardSub} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {item.memberCount != null ? `${item.memberCount} members` : 'Open'}
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={modal}
        animationType="slide"
        transparent
        onRequestClose={() => !creating && setModal(false)}
      >
        <View style={styles.modalRoot}>
          <View style={styles.overlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => !creating && setModal(false)}
            />
            <View style={[styles.sheet, { maxHeight: createSheetMetrics.maxSheet }]}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.sheetKeyboard}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  style={[styles.sheetScroll, { maxHeight: createSheetMetrics.scrollMax }]}
                  contentContainerStyle={styles.sheetScrollContent}
                >
                  <Text style={styles.sheetTitle}>New group</Text>
                  <Text style={styles.label}>Name</Text>
                  <TextInput
                    style={styles.input}
                    value={gName}
                    onChangeText={setGName}
                    placeholder="Committee, Floor 3, etc."
                    placeholderTextColor={Colors.textMuted}
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                  />
                  <Text style={styles.label}>Description (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMulti]}
                    value={gDesc}
                    onChangeText={setGDesc}
                    placeholder="Short purpose"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                  />
                </ScrollView>
              </KeyboardAvoidingView>
              <View
                style={[
                  styles.sheetFooter,
                  { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.xs },
                ]}
              >
                <View style={styles.sheetActions}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => !creating && setModal(false)}
                    style={styles.flex}
                  />
                  <Button
                    title={creating ? '…' : 'Create'}
                    onPress={() => void createGroup()}
                    loading={creating}
                    style={styles.flex}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  createBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(108,99,255,0.1)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.25)',
  },
  createBarText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(108,99,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  cardSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  modalRoot: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.sm,
  },
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    flexDirection: 'column',
    flexShrink: 0,
  },
  sheetKeyboard: {
    width: '100%',
  },
  sheetScroll: {},
  sheetScrollContent: {
    paddingBottom: Spacing.md,
  },
  sheetFooter: {
    flexShrink: 0,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bg,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  sheetActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  flex: { flex: 1 },
});

export default GroupsScreen;
