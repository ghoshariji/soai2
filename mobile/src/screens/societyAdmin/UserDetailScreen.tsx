import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';
import { userService } from '@/services/api';
import { useAppSelector } from '@/store';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';

type UsersStackParamList = {
  UsersList: undefined;
  CreateUser: undefined;
  UserDetail: { userId: string };
  BulkUpload: undefined;
};

type Props = NativeStackScreenProps<UsersStackParamList, 'UserDetail'>;

type RoleOpt = 'user' | 'society_admin';
type StatusOpt = 'active' | 'inactive' | 'blocked';

const UserDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { userId } = route.params;
  const me = useAppSelector((s) => s.auth.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [u, setU] = useState<Record<string, unknown> | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [role, setRole] = useState<RoleOpt>('user');
  const [status, setStatus] = useState<StatusOpt>('active');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getOne(userId);
      const doc = (res.data as { data?: Record<string, unknown> }).data;
      if (!doc) throw new Error('empty');
      setU(doc);
      setName(String(doc.name ?? ''));
      setPhone(String(doc.phone ?? ''));
      setFlatNumber(String(doc.flatNumber ?? ''));
      const r = doc.role === 'society_admin' ? 'society_admin' : 'user';
      setRole(r);
      const st = doc.status as string;
      if (st === 'inactive' || st === 'blocked') setStatus(st);
      else if (st === 'pending') setStatus('inactive');
      else setStatus('active');
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load user' });
      setU(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSelf = me?.id === userId;

  const save = async () => {
    if (name.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'Name must be at least 2 characters' });
      return;
    }
    setSaving(true);
    try {
      await userService.update(userId, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        flatNumber: flatNumber.trim() || undefined,
        role,
        status,
      });
      Toast.show({ type: 'success', text1: 'User updated' });
      void load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { message?: string } } }).response?.data
                ?.message ?? '',
            )
          : 'Update failed';
      Toast.show({ type: 'error', text1: msg || 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  const onToggleStatus = () => {
    if (isSelf) {
      Toast.show({ type: 'info', text1: 'You cannot change your own status here' });
      return;
    }
    Alert.alert('Update access', 'Toggle or set account status for this member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Run toggle',
        onPress: async () => {
          try {
            const res = await userService.toggleStatus(userId);
            const next = (res.data as { data?: { status?: string } }).data?.status;
            if (next) setStatus(next as StatusOpt);
            Toast.show({ type: 'success', text1: 'Status updated' });
            void load();
          } catch {
            Toast.show({ type: 'error', text1: 'Toggle failed' });
          }
        },
      },
    ]);
  };

  const onDelete = () => {
    if (isSelf) {
      Toast.show({ type: 'info', text1: 'You cannot delete your own account' });
      return;
    }
    Alert.alert('Delete user', 'Soft-delete this member? They will not be able to sign in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await userService.delete(userId);
            Toast.show({ type: 'success', text1: 'User removed' });
            navigation.goBack();
          } catch {
            Toast.show({ type: 'error', text1: 'Delete failed' });
          }
        },
      },
    ]);
  };

  if (loading && !u) {
    return (
      <View style={styles.root}>
        <Header title="Member" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!u) {
    return (
      <View style={styles.root}>
        <Header title="Member" showBack />
        <View style={styles.center}>
          <Text style={styles.muted}>User not found.</Text>
        </View>
      </View>
    );
  }

  const email = String(u.email ?? '');
  const rawStatus = String(u.status ?? 'active');

  return (
    <View style={styles.root}>
      <Header title={name || 'Member'} showBack />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.section}>Status</Text>
          <Badge
            label={rawStatus}
            variant={
              rawStatus === 'active'
                ? 'success'
                : rawStatus === 'blocked'
                  ? 'error'
                  : rawStatus === 'pending'
                    ? 'info'
                    : 'warning'
            }
          />
        </View>
        <Text style={styles.email}>{email}</Text>

        <Text style={styles.label}>Full name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Flat / unit</Text>
        <TextInput style={styles.input} value={flatNumber} onChangeText={setFlatNumber} />

        <Text style={styles.label}>Role</Text>
        <View style={styles.chips}>
          {(['user', 'society_admin'] as RoleOpt[]).map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.chip, role === r && styles.chipOn]}
              onPress={() => setRole(r)}
            >
              <Text style={[styles.chipTxt, role === r && styles.chipTxtOn]}>
                {r.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Status (saved with profile)</Text>
        <View style={styles.chips}>
          {(['active', 'inactive', 'blocked'] as StatusOpt[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, status === s && styles.chipOn]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.chipTxt, status === s && styles.chipTxtOn]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title={saving ? 'Saving…' : 'Save changes'}
          onPress={save}
          disabled={saving}
          style={styles.mt}
        />

        {!isSelf ? (
          <>
            <Button
              title="Quick toggle (active ↔ blocked)"
              variant="outline"
              onPress={onToggleStatus}
              style={styles.mt}
            />
            <Button title="Delete user" variant="danger" onPress={onDelete} style={styles.mt} />
          </>
        ) : (
          <Text style={styles.hint}>You are viewing your own account. Status toggle and delete are disabled.</Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: Colors.textMuted },
  scroll: { padding: Spacing.lg, paddingBottom: 40 },
  section: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  email: { color: Colors.textSecondary, fontSize: 14, marginTop: 6, marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: 13, marginTop: Spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: 'rgba(108,99,255,0.12)' },
  chipTxt: { color: Colors.textSecondary, textTransform: 'capitalize' },
  chipTxtOn: { color: Colors.primaryLight, fontWeight: '700' },
  mt: { marginTop: Spacing.md },
  hint: { color: Colors.textMuted, fontSize: 13, marginTop: Spacing.lg, lineHeight: 20 },
});

export default UserDetailScreen;
