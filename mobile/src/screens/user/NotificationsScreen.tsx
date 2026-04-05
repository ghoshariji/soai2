import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Radius } from '@/theme';
import { notificationService } from '@/services/api';
import Header from '@/components/common/Header';
import EmptyState from '@/components/common/EmptyState';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const NotificationsScreen: React.FC = () => {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await notificationService.getAll({ page: 1, limit: 50 });
      const payload = res.data as {
        data?: { notifications?: Record<string, unknown>[] };
      };
      setItems(payload.data?.notifications ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.safe}>
        <Header title="Notifications" showBack />
        <LoadingSpinner message="Loading…" />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Header title="Notifications" showBack />
      <FlatList
        data={items}
        keyExtractor={(item, i) => String((item as { _id?: string })._id ?? i)}
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
            icon="notifications-off-outline"
            title="No notifications"
            message="Announcements, complaints, and chats will appear here."
          />
        }
        renderItem={({ item }) => {
          const n = item as {
            title?: string;
            body?: string;
            isRead?: boolean;
            createdAt?: string;
          };
          return (
            <TouchableOpacity
              style={[styles.row, !n.isRead && styles.rowUnread]}
              activeOpacity={0.85}
            >
              <View style={styles.iconWrap}>
                <Icon name="notifications" size={20} color={Colors.primary} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {n.title ?? 'Notification'}
                </Text>
                {n.body ? (
                  <Text style={styles.rowSub} numberOfLines={2}>
                    {n.body}
                  </Text>
                ) : null}
                {n.createdAt ? (
                  <Text style={styles.rowMeta}>
                    {new Date(n.createdAt).toLocaleString()}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowUnread: {
    borderColor: 'rgba(108,99,255,0.35)',
    backgroundColor: 'rgba(108,99,255,0.06)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(108,99,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  rowSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  rowMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
  },
});

export default NotificationsScreen;
