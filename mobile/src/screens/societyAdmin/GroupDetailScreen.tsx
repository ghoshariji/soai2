import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';

import { Colors, Spacing, Radius } from '@/theme';
import { groupService, userService, getApiErrorMessage } from '@/services/api';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import Avatar from '@/components/common/Avatar';
import type { CommunityStackParamList } from '@/navigation/SocietyAdminNavigator';

type R = RouteProp<CommunityStackParamList, 'GroupDetail'>;

interface MemberRow {
  userId?: { _id?: string; name?: string; profilePhoto?: string; flatNumber?: string };
  role?: string;
}

function normaliseMemberRow(raw: Record<string, unknown>): MemberRow {
  const uid = raw.userId;
  if (uid && typeof uid === 'object' && uid !== null && '_id' in uid) {
    const u = uid as Record<string, unknown>;
    return {
      userId: {
        _id: u._id != null ? String(u._id) : undefined,
        name: typeof u.name === 'string' ? u.name : undefined,
        profilePhoto:
          typeof u.profilePhoto === 'string' ? u.profilePhoto : undefined,
        flatNumber:
          typeof u.flatNumber === 'string' ? u.flatNumber : undefined,
      },
      role: typeof raw.role === 'string' ? raw.role : undefined,
    };
  }
  if (typeof uid === 'string' && uid.length > 0) {
    return {
      userId: { _id: uid, name: 'Member' },
      role: typeof raw.role === 'string' ? raw.role : undefined,
    };
  }
  return { role: typeof raw.role === 'string' ? raw.role : undefined };
}

interface PickerUser {
  _id: string;
  name: string;
  email: string;
  flatNumber?: string;
  profilePhoto: string | null;
  role: string;
}

function normalisePickerUser(raw: Record<string, unknown>): PickerUser | null {
  const id = raw._id ?? raw.id;
  if (id == null || id === '') return null;
  return {
    _id: String(id),
    name: String(raw.name ?? 'User'),
    email: String(raw.email ?? ''),
    flatNumber: raw.flatNumber != null ? String(raw.flatNumber) : undefined,
    profilePhoto: typeof raw.profilePhoto === 'string' ? raw.profilePhoto : null,
    role: typeof raw.role === 'string' ? raw.role : 'user',
  };
}

const GroupDetailScreen: React.FC = () => {
  const route = useRoute<R>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { groupId, name: initialName } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupName, setGroupName] = useState(initialName ?? '');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickerUsers, setPickerUsers] = useState<PickerUser[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const selectedPickerUser = useMemo(
    () => pickerUsers.find((u) => u._id === selectedUserId) ?? null,
    [pickerUsers, selectedUserId],
  );

  /** Pixel height so the sheet is bounded; list uses flex+minHeight:0 so footer buttons stay on-screen. */
  const addMemberSheetStyle = useMemo(() => {
    const h = Dimensions.get('window').height;
    const sheetH = Math.round(Math.min(h * 0.88, h - insets.top - Spacing.md * 2));
    return {
      height: sheetH,
      maxHeight: sheetH,
      paddingBottom: Spacing.md + Math.max(insets.bottom, Spacing.sm),
    };
  }, [insets.top, insets.bottom]);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await groupService.getOne(groupId);
      const envelope = res.data as { data?: Record<string, unknown> };
      const g = envelope.data;
      if (!g || typeof g !== 'object') {
        throw new Error('Invalid group payload');
      }
      setGroupName(String(g.name ?? initialName ?? 'Group'));
      const memRaw = g.members;
      const rows = Array.isArray(memRaw)
        ? memRaw
            .filter((m): m is Record<string, unknown> => m != null && typeof m === 'object')
            .map((m) => normaliseMemberRow(m))
        : [];
      setMembers(rows);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load group' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, initialName]);

  useEffect(() => {
    load();
  }, [load]);

  const memberIdSet = React.useMemo(() => {
    const s = new Set<string>();
    members.forEach((m) => {
      const u = m.userId;
      if (u && typeof u === 'object' && u._id) s.add(String(u._id));
    });
    return s;
  }, [members]);

  const loadPickerUsers = useCallback(
    async (q: string) => {
      setPickerLoading(true);
      try {
        const res = await userService.getAll({
          page: 1,
          limit: 100,
          status: 'active',
          ...(q.trim() ? { search: q.trim() } : {}),
        });
        const raw = res.data.data;
        const list = Array.isArray(raw)
          ? raw
              .map((row) => normalisePickerUser(row as Record<string, unknown>))
              .filter((u): u is PickerUser => u != null)
          : [];
        setPickerUsers(list.filter((u) => !memberIdSet.has(u._id)));
      } catch {
        Toast.show({ type: 'error', text1: 'Could not load users' });
        setPickerUsers([]);
      } finally {
        setPickerLoading(false);
      }
    },
    [memberIdSet],
  );

  useEffect(() => {
    if (!addOpen) return;
    const delayMs = searchQuery.trim() ? 350 : 0;
    const t = setTimeout(() => {
      void loadPickerUsers(searchQuery);
    }, delayMs);
    return () => clearTimeout(t);
  }, [searchQuery, addOpen, loadPickerUsers]);

  const removeMember = (uid: string, displayName: string) => {
    Alert.alert('Remove member', `Remove ${displayName} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await groupService.removeMember(groupId, uid);
            Toast.show({ type: 'success', text1: 'Member removed' });
            await load();
          } catch {
            Toast.show({ type: 'error', text1: 'Remove failed' });
          }
        },
      },
    ]);
  };

  const addMember = async (userIdOverride?: string | null) => {
    const uid = String(userIdOverride ?? selectedUserId ?? '').trim();
    if (!uid) {
      Toast.show({ type: 'info', text1: 'Select a resident from the list' });
      return;
    }
    setSelectedUserId(uid);
    setAdding(true);
    try {
      await groupService.addMember(groupId, uid);
      Toast.show({ type: 'success', text1: 'Member added' });
      setAddOpen(false);
      setSelectedUserId(null);
      await load();
    } catch (e: unknown) {
      Toast.show({ type: 'error', text1: getApiErrorMessage(e, 'Add failed') });
    } finally {
      setAdding(false);
    }
  };

  const openAddModal = () => {
    setSearchQuery('');
    setSelectedUserId(null);
    setAddOpen(true);
  };

  const deleteGroup = () => {
    Alert.alert('Delete group', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await groupService.delete(groupId);
            Toast.show({ type: 'success', text1: 'Group deleted' });
            navigation.goBack();
          } catch {
            Toast.show({ type: 'error', text1: 'Delete failed' });
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.safe}>
        <Header title="Group" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Header title={groupName} showBack subtitle={`${members.length} members`} />
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={openAddModal}>
          <Icon name="person-add-outline" size={20} color={Colors.primary} />
          <Text style={styles.actionText}>Add member</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnDanger} onPress={deleteGroup}>
          <Icon name="trash-outline" size={20} color={Colors.error} />
          <Text style={styles.actionTextDanger}>Delete</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={members}
        keyExtractor={(item, i) => {
          const u = item.userId;
          const id = u && typeof u === 'object' && '_id' in u ? String(u._id) : `m-${i}`;
          return id;
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const u = item.userId as { _id?: string; name?: string; profilePhoto?: string; flatNumber?: string } | undefined;
          const uid = u?._id ?? '';
          const nm = u?.name ?? 'User';
          return (
            <View style={styles.row}>
              <Avatar name={nm} uri={u?.profilePhoto} size="md" />
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{nm}</Text>
                {u?.flatNumber ? (
                  <Text style={styles.rowSub}>Flat {u.flatNumber}</Text>
                ) : null}
                {item.role ? (
                  <Text style={styles.badge}>{item.role}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => removeMember(uid, nm)} hitSlop={12}>
                <Icon name="close-circle-outline" size={24} color={Colors.error} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <Modal
        visible={addOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !adding && setAddOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => !adding && setAddOpen(false)} />
            <View style={[styles.pickerSheet, addMemberSheetStyle]}>
              <View style={styles.pickerSheetTop}>
                <Text style={styles.dialogTitle}>Add member</Text>
                <Text style={styles.hint}>
                  Search by name, email, or flat. Only active residents not already in this group are shown.
                </Text>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search users…"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.pickerListWrap}>
                {pickerLoading && pickerUsers.length === 0 ? (
                  <View style={styles.pickerLoading}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                ) : (
                  <FlatList
                    data={pickerUsers}
                    keyExtractor={(u) => u._id}
                    style={styles.pickerList}
                    contentContainerStyle={styles.pickerListContent}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    ListEmptyComponent={
                      <Text style={styles.pickerEmpty}>
                        {pickerLoading ? 'Loading…' : 'No users match your search, or everyone is already in this group.'}
                      </Text>
                    }
                    renderItem={({ item }) => {
                      const selected = selectedUserId === item._id;
                      return (
                        <TouchableOpacity
                          style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                          onPress={() => {
                            if (adding) return;
                            setSelectedUserId(item._id);
                            void addMember(item._id);
                          }}
                          activeOpacity={0.7}
                          disabled={adding}
                        >
                          <Avatar name={item.name} uri={item.profilePhoto} size="md" />
                          <View style={styles.pickerRowBody}>
                            <Text style={styles.pickerName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.pickerEmail} numberOfLines={1}>
                              {item.email}
                            </Text>
                            <View style={styles.pickerMeta}>
                              {item.flatNumber ? (
                                <Text style={styles.pickerFlat}>Flat {item.flatNumber}</Text>
                              ) : null}
                              <Text style={styles.pickerRole}>{item.role.replace(/_/g, ' ')}</Text>
                            </View>
                          </View>
                          <Icon
                            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                            size={24}
                            color={selected ? Colors.primary : Colors.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </View>
              <View style={styles.pickerSheetFooter}>
                {selectedPickerUser ? (
                  <View style={styles.selectedBanner}>
                    <Text style={styles.selectedBannerLabel} numberOfLines={1}>
                      Selected: {selectedPickerUser.name}
                    </Text>
                    <Text style={styles.selectedBannerHint} numberOfLines={2}>
                      Tap a resident to add them immediately, or pick one and press Add.
                    </Text>
                  </View>
                ) : null}
                <View style={styles.dialogBtns}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => !adding && setAddOpen(false)}
                    style={styles.flex}
                  />
                  <Button
                    title={adding ? 'Adding…' : 'Add'}
                    onPress={() => void addMember(selectedUserId)}
                    loading={adding}
                    disabled={!selectedUserId || adding}
                    style={styles.flex}
                  />
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  actionText: { fontWeight: '600', color: Colors.primary },
  actionTextDanger: { fontWeight: '600', color: Colors.error },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  rowSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  badge: {
    marginTop: 4,
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  modalRoot: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
    padding: Spacing.sm,
  },
  pickerSheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    flexDirection: 'column',
  },
  pickerSheetTop: {
    flexShrink: 0,
  },
  pickerListWrap: {
    flex: 1,
    minHeight: 0,
  },
  pickerListContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xs,
  },
  pickerSheetFooter: {
    flexShrink: 0,
    paddingTop: Spacing.xs,
  },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 19 },
  searchInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.bgInput,
  },
  pickerList: { flex: 1 },
  pickerLoading: { flex: 1, minHeight: 120, justifyContent: 'center', alignItems: 'center' },
  pickerEmpty: {
    textAlign: 'center',
    color: Colors.textMuted,
    paddingVertical: Spacing.xl,
    fontSize: 14,
    lineHeight: 20,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pickerRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}14`,
  },
  pickerRowBody: { flex: 1, minWidth: 0 },
  pickerName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  pickerEmail: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  pickerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 4 },
  pickerFlat: { fontSize: 12, color: Colors.textMuted },
  pickerRole: { fontSize: 11, color: Colors.primary, textTransform: 'capitalize' },
  selectedBanner: {
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
  },
  selectedBannerLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  selectedBannerHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  dialogBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  flex: { flex: 1 },
});

export default GroupDetailScreen;
