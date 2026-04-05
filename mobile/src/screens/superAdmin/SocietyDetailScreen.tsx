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
import { societyService, subscriptionService } from '@/services/api';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';

type ParamList = {
  SocietiesList: undefined;
  CreateSociety: undefined;
  SocietyDetail: { societyId: string };
};

type Props = NativeStackScreenProps<ParamList, 'SocietyDetail'>;

const SocietyDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { societyId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  const [subPlan, setSubPlan] = useState('basic');
  const [subExpiry, setSubExpiry] = useState('');
  const [subSaving, setSubSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await societyService.getOne(societyId);
      const d = (res.data as { data?: Record<string, unknown> }).data;
      if (!d) throw new Error('Empty response');
      setRow(d);
      setName(String(d.name ?? ''));
      setAddress(String(d.address ?? ''));
      setCity(String(d.city ?? ''));
      const sub = d.subscription as Record<string, unknown> | null | undefined;
      const plan = sub?.plan != null ? String(sub.plan) : 'basic';
      setSubPlan(['basic', 'premium', 'custom'].includes(plan) ? plan : 'basic');
      const ex = sub?.expiryDate;
      setSubExpiry(
        ex
          ? String(ex).split('T')[0] ?? ''
          : '',
      );
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load society' });
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSociety = async () => {
    if (!name.trim() || !address.trim() || !city.trim()) {
      Toast.show({ type: 'error', text1: 'Name, address, and city are required' });
      return;
    }
    setSaving(true);
    try {
      await societyService.update(societyId, {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
      });
      Toast.show({ type: 'success', text1: 'Society updated' });
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

  const saveSubscription = async () => {
    if (!subExpiry) {
      Toast.show({ type: 'error', text1: 'Set an expiry date' });
      return;
    }
    setSubSaving(true);
    try {
      await subscriptionService.update(societyId, {
        plan: subPlan,
        expiryDate: subExpiry,
      });
      Toast.show({ type: 'success', text1: 'Subscription updated' });
      void load();
    } catch {
      Toast.show({ type: 'error', text1: 'Subscription update failed' });
    } finally {
      setSubSaving(false);
    }
  };

  const societyStatus =
    row?.status === 'inactive' ? 'inactive' : 'active';

  const onToggleSociety = () => {
    const nextInactive = societyStatus === 'active';
    Alert.alert(
      nextInactive ? 'Deactivate society' : 'Activate society',
      nextInactive
        ? 'Residents will be blocked from signing in until reactivated.'
        : 'Restore access for this society.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: nextInactive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await societyService.toggleStatus(societyId);
              Toast.show({ type: 'success', text1: 'Status updated' });
              void load();
            } catch {
              Toast.show({ type: 'error', text1: 'Toggle failed' });
            }
          },
        },
      ],
    );
  };

  const onDelete = () => {
    Alert.alert(
      'Delete society',
      'Soft-deletes the society and deactivates all users. This cannot be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await societyService.delete(societyId);
              Toast.show({ type: 'success', text1: 'Society deleted' });
              navigation.goBack();
            } catch {
              Toast.show({ type: 'error', text1: 'Delete failed' });
            }
          },
        },
      ],
    );
  };

  const admin = row?.adminId as Record<string, unknown> | undefined;
  const adminName = admin && typeof admin === 'object' ? String(admin.name ?? '') : '';
  const adminEmail = admin && typeof admin === 'object' ? String(admin.email ?? '') : '';

  if (loading && !row) {
    return (
      <View style={styles.root}>
        <Header title="Society" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.root}>
        <Header title="Society" showBack />
        <View style={styles.center}>
          <Text style={styles.muted}>Society not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header title={name || 'Society'} showBack />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.section}>Status</Text>
          <Badge
            label={societyStatus}
            variant={societyStatus === 'active' ? 'success' : 'error'}
          />
        </View>
        <Button
          title={
            societyStatus === 'active'
              ? 'Deactivate (revoke sessions)'
              : 'Activate society'
          }
          variant="outline"
          onPress={onToggleSociety}
        />

        <Text style={[styles.section, styles.mt]}>Details</Text>
        <Label text="Name" />
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        <Label text="Address" />
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={address}
          onChangeText={setAddress}
          multiline
        />
        <Label text="City" />
        <TextInput style={styles.input} value={city} onChangeText={setCity} />

        <Button
          title={saving ? 'Saving…' : 'Save society'}
          onPress={saveSociety}
          disabled={saving}
          style={styles.mt}
        />

        <Text style={[styles.section, styles.mt]}>Admin contact</Text>
        <Text style={styles.meta}>{adminName || '—'}</Text>
        <Text style={styles.meta}>{adminEmail || '—'}</Text>

        <Text style={[styles.section, styles.mt]}>Subscription</Text>
        <Text style={styles.hint}>Plan and billing period</Text>
        <View style={styles.statusRow}>
          {(['basic', 'premium', 'custom'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.statusChip, subPlan === p && styles.statusChipOn]}
              onPress={() => setSubPlan(p)}
            >
              <Text style={[styles.statusTxt, subPlan === p && styles.statusTxtOn]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Label text="Expiry (YYYY-MM-DD)" />
        <TextInput
          style={styles.input}
          value={subExpiry}
          onChangeText={setSubExpiry}
          autoCapitalize="none"
        />
        <Button
          title={subSaving ? 'Saving…' : 'Save subscription'}
          variant="outline"
          onPress={saveSubscription}
          disabled={subSaving}
        />

        <Button title="Delete society" variant="danger" onPress={onDelete} style={styles.mt} />
      </ScrollView>
    </View>
  );
};

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: Colors.textMuted },
  scroll: { padding: Spacing.lg, paddingBottom: 48 },
  section: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  mt: { marginTop: Spacing.lg },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
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
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusChipOn: { borderColor: Colors.primary, backgroundColor: 'rgba(108,99,255,0.12)' },
  statusTxt: { color: Colors.textSecondary, textTransform: 'capitalize' },
  statusTxtOn: { color: Colors.primaryLight, fontWeight: '700' },
  meta: { color: Colors.textSecondary, fontSize: 14, marginTop: 4 },
});

export default SocietyDetailScreen;
