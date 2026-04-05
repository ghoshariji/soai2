import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import { Colors, Spacing, Radius } from '@/theme';
import { groupService } from '@/services/api';
import Header from '@/components/common/Header';
import EmptyState from '@/components/common/EmptyState';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Toast from 'react-native-toast-message';

interface GroupRow {
  _id: string;
  name?: string;
  description?: string;
  members?: unknown[];
}

const GroupsScreen: React.FC = () => {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await groupService.getMyGroups();
      const body = res.data as { data?: GroupRow[] };
      const raw = body.data ?? [];
      const mine = Array.isArray(raw) ? raw.filter((g) => g.isMember) : [];
      setGroups(mine);
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

  const onLeave = (g: GroupRow) => {
    Alert.alert('Leave group', `Leave "${g.name ?? 'this group'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusyId(g._id);
          try {
            await groupService.leave(g._id);
            Toast.show({ type: 'success', text1: 'Left group' });
            load();
          } catch {
            Toast.show({ type: 'error', text1: 'Leave failed' });
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.safe}>
        <Header title="My groups" showBack />
        <LoadingSpinner message="Loading groups…" />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Header title="My groups" showBack />
      <FlatList
        data={groups}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No groups yet"
            message="Join a group from society invites or ask your admin to add you."
          />
        }
        renderItem={({ item }) => {
          const count = Array.isArray(item.members) ? item.members.length : 0;
          const busy = busyId === item._id;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Icon name="people-circle-outline" size={28} color={Colors.primary} />
                <View style={styles.cardBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name ?? 'Group'}
                  </Text>
                  {item.description ? (
                    <Text style={styles.desc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>{count} members</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.leaveBtn}
                onPress={() => onLeave(item)}
                disabled={busy}
              >
                <Text style={styles.leaveText}>{busy ? '…' : 'Leave group'}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardTop: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  cardBody: { flex: 1 },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  desc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  leaveBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  leaveText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.error,
  },
});

export default GroupsScreen;
