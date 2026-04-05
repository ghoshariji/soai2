import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';
import { societyService } from '@/services/api';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';

type PlanKey = 'basic' | 'premium' | 'custom';

const PLANS: { key: PlanKey; label: string; sub: string }[] = [
  { key: 'basic', label: 'Basic', sub: 'Up to 50 users, core features' },
  { key: 'premium', label: 'Premium', sub: 'Up to 500 users, bulk upload' },
  { key: 'custom', label: 'Custom', sub: 'Set max users (default 200)' },
];

function defaultExpiryIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0] ?? '';
}

const CreateSocietyScreen: React.FC = () => {
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [plan, setPlan] = useState<PlanKey>('basic');
  const [expiryDate, setExpiryDate] = useState(defaultExpiryIso());
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [maxUsers, setMaxUsers] = useState('200');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (name.trim().length < 3) {
      Toast.show({ type: 'error', text1: 'Society name must be at least 3 characters' });
      return;
    }
    if (address.trim().length < 5) {
      Toast.show({ type: 'error', text1: 'Address must be at least 5 characters' });
      return;
    }
    if (city.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'City is required' });
      return;
    }
    if (adminName.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'Admin name is required' });
      return;
    }
    if (!adminEmail.includes('@')) {
      Toast.show({ type: 'error', text1: 'Valid admin email is required' });
      return;
    }
    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      Toast.show({ type: 'error', text1: 'Choose a future subscription expiry date' });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        plan,
        expiryDate: expiry.toISOString(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPhone: adminPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        price: 0,
      };
      if (plan === 'custom') {
        const n = parseInt(maxUsers, 10);
        body.maxUsers = Number.isFinite(n) && n > 0 ? n : 200;
      }

      await societyService.create(body);
      Toast.show({
        type: 'success',
        text1: 'Society created',
        text2: 'Welcome email sent to the admin if SMTP is configured.',
      });
      navigation.goBack();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { message?: string } } }).response?.data
                ?.message ?? '',
            )
          : 'Could not create society';
      Toast.show({ type: 'error', text1: msg || 'Could not create society' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <Header title="New society" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.section}>Society</Text>
          <Field label="Name *" value={name} onChangeText={setName} />
          <Field label="Address *" value={address} onChangeText={setAddress} multiline />
          <Field label="City *" value={city} onChangeText={setCity} />

          <Text style={styles.section}>Subscription</Text>
          <View style={styles.planRow}>
            {PLANS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.planChip, plan === p.key && styles.planChipOn]}
                onPress={() => setPlan(p.key)}
              >
                <Text style={[styles.planLabel, plan === p.key && styles.planLabelOn]}>
                  {p.label}
                </Text>
                <Text style={styles.planSub}>{p.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {plan === 'custom' ? (
            <Field
              label="Max users"
              value={maxUsers}
              onChangeText={setMaxUsers}
              keyboardType="number-pad"
            />
          ) : null}
          <Field
            label="Expiry date (YYYY-MM-DD) *"
            value={expiryDate}
            onChangeText={setExpiryDate}
            autoCapitalize="none"
          />

          <Text style={styles.section}>Society admin</Text>
          <Field label="Admin full name *" value={adminName} onChangeText={setAdminName} />
          <Field
            label="Admin email *"
            value={adminEmail}
            onChangeText={setAdminEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Admin phone"
            value={adminPhone}
            onChangeText={setAdminPhone}
            keyboardType="phone-pad"
          />

          <Text style={styles.section}>Internal notes</Text>
          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <Button
            title={submitting ? 'Creating…' : 'Create society'}
            onPress={submit}
            disabled={submitting}
            style={styles.submit}
          />
          {submitting ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.md }} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{props.label}</Text>
      <TextInput
        style={[fieldStyles.input, props.multiline && fieldStyles.inputMulti]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholderTextColor={Colors.textMuted}
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: 13, marginBottom: 6, fontWeight: '600' },
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
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  planRow: { gap: Spacing.sm, marginBottom: Spacing.md },
  planChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    backgroundColor: Colors.bgCard,
  },
  planChipOn: { borderColor: Colors.primary, backgroundColor: 'rgba(108,99,255,0.08)' },
  planLabel: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  planLabelOn: { color: Colors.primaryLight },
  planSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  submit: { marginTop: Spacing.lg },
});

export default CreateSocietyScreen;
