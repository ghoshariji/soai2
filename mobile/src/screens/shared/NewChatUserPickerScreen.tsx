import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';

import { Colors, Spacing, Radius } from '@/theme';
import { chatService, getApiErrorMessage } from '@/services/api';
import { useAppSelector } from '@/store';
import Header from '@/components/common/Header';
import Avatar from '@/components/common/Avatar';
import type { ChatStackParamList } from '@/navigation/ChatStackNavigator';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'NewChatUserPicker'>;

interface DirUser {
  _id: string;
  name: string;
  profilePhoto: string | null;
  flatNumber?: string;
}

function normaliseRow(raw: Record<string, unknown>): DirUser | null {
  const id = raw._id ?? raw.id;
  if (id == null || id === '') return null;
  return {
    _id: String(id),
    name: String(raw.name ?? 'User'),
    profilePhoto: typeof raw.profilePhoto === 'string' ? raw.profilePhoto : null,
    flatNumber: raw.flatNumber != null ? String(raw.flatNumber) : undefined,
  };
}

const NewChatUserPickerScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const selfId = useAppSelector((s) => s.auth.user?.id ?? '');
  const societyId = useAppSelector((s) => s.auth.user?.societyId);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<DirUser[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      const res = await chatService.getDirectory();
      const body = res.data as { data?: unknown };
      const list = Array.isArray(body.data) ? body.data : [];
      const mapped = list
        .filter((row): row is Record<string, unknown> => row != null && typeof row === 'object')
        .map((row) => normaliseRow(row))
        .filter((u): u is DirUser => u != null && u._id !== selfId);
      setUsers(mapped);
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Could not load members',
        text2: getApiErrorMessage(e),
      });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [societyId, selfId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = users.filter((u) => {
    if (!q.trim()) return true;
    const n = q.trim().toLowerCase();
    return (
      u.name.toLowerCase().includes(n) ||
      (u.flatNumber?.toLowerCase().includes(n) ?? false)
    );
  });

  const openChat = (u: DirUser) => {
    navigation.navigate('PersonalChat', {
      userId: u._id,
      userName: u.name,
      userPhoto: u.profilePhoto ?? undefined,
    });
  };

  if (!societyId) {
    return (
      <View style={styles.safe}>
        <Header title="New chat" showBack />
        <View style={styles.centered}>
          <Icon name="people-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No society</Text>
          <Text style={styles.emptySub}>
            Join a society to message other residents.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Header title="New chat" showBack subtitle="Choose someone in your society" />
      <TextInput
        style={styles.search}
        value={q}
        onChangeText={setQ}
        placeholder="Search by name or flat…"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptySub}>
                {users.length === 0
                  ? 'No other members found in your society.'
                  : 'No matches for your search.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openChat(item)} activeOpacity={0.7}>
              <Avatar name={item.name} uri={item.profilePhoto} size="md" />
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.flatNumber ? (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    Flat {item.flatNumber}
                  </Text>
                ) : null}
              </View>
              <Icon name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  search: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgInput,
    color: Colors.textPrimary,
    fontSize: 16,
  },
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    marginTop: Spacing.md,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptySub: {
    marginTop: Spacing.sm,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});

export default NewChatUserPickerScreen;
