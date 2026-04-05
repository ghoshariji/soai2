import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';

import { userService } from '../../services/api';
import { Colors, Spacing, Radius } from '../../theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'user' | 'society_admin';

interface FormData {
  name: string;
  email: string;
  phone: string;
  flatNumber: string;
  role: Role;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  flatNumber?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePhone(phone: string): boolean {
  return /^\+?[\d\s\-()]{7,15}$/.test(phone.trim());
}

function validate(form: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.email.trim())            errors.email = 'Email is required';
  else if (!validateEmail(form.email)) errors.email = 'Enter a valid email address';
  if (form.phone.trim() && !validatePhone(form.phone))
    errors.phone = 'Enter a valid phone number';
  if (!form.flatNumber.trim()) errors.flatNumber = 'Flat number is required';
  return errors;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  error?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoCorrect?: boolean;
}

const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
}) => (
  <View style={fieldStyles.container}>
    <Text style={fieldStyles.label}>{label}</Text>
    <TextInput
      style={[fieldStyles.input, error ? fieldStyles.inputError : null]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      selectionColor={Colors.primary}
    />
    {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
  </View>
);

const fieldStyles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  inputError: { borderColor: Colors.error },
  errorText:  { fontSize: 12, color: Colors.error, marginTop: 4 },
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const ROLES: { label: string; value: Role; description: string }[] = [
  { label: 'Resident',      value: 'user',          description: 'Standard member access' },
  { label: 'Society Admin', value: 'society_admin', description: 'Full administrative access' },
];

const CreateUserScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState<FormData>({
    name:        '',
    email:       '',
    phone:       '',
    flatNumber:  '',
    role:        'user',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const updateField = (key: keyof FormData) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleSubmit = async () => {
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      await (userService as unknown as {
        createUser: (d: Record<string, unknown>) => Promise<unknown>;
      }).createUser({
        name:       form.name.trim(),
        email:      form.email.trim().toLowerCase(),
        phone:      form.phone.trim() || undefined,
        flatNumber: form.flatNumber.trim(),
        role:       form.role,
      });

      Toast.show({
        type: 'success',
        text1: 'User created!',
        text2: `${form.name.trim()} has been added successfully.`,
      });
      navigation.goBack();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Failed to create user.';
      Toast.show({ type: 'error', text1: 'Error', text2: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create User</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Fields */}
          <Field
            label="Full Name *"
            value={form.name}
            onChangeText={updateField('name')}
            placeholder="e.g. Ravi Sharma"
            error={errors.name}
            autoCapitalize="words"
          />
          <Field
            label="Email Address *"
            value={form.email}
            onChangeText={updateField('email')}
            placeholder="resident@example.com"
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="Phone Number"
            value={form.phone}
            onChangeText={updateField('phone')}
            placeholder="+91 99999 00000"
            error={errors.phone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="Flat Number *"
            value={form.flatNumber}
            onChangeText={updateField('flatNumber')}
            placeholder="e.g. A-302"
            error={errors.flatNumber}
            autoCapitalize="characters"
          />

          {/* Role Picker */}
          <View style={styles.roleSection}>
            <Text style={styles.roleLabel}>Role *</Text>
            <View style={styles.roleOptions}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[
                    styles.roleCard,
                    form.role === r.value && styles.roleCardActive,
                  ]}
                  onPress={() => setForm((prev) => ({ ...prev, role: r.value }))}
                  activeOpacity={0.8}
                >
                  <View style={styles.roleCardLeft}>
                    <View
                      style={[
                        styles.radioOuter,
                        form.role === r.value && styles.radioOuterActive,
                      ]}
                    >
                      {form.role === r.value && <View style={styles.radioInner} />}
                    </View>
                    <View style={styles.roleTextCol}>
                      <Text
                        style={[
                          styles.roleTitle,
                          form.role === r.value && styles.roleTitleActive,
                        ]}
                      >
                        {r.label}
                      </Text>
                      <Text style={styles.roleDesc}>{r.description}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Icon name="person-add-outline" size={18} color={Colors.white} />
                <Text style={styles.submitBtnText}>Create User</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },
  flex:  { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerRight: { width: 30 },

  roleSection: { marginBottom: Spacing.md },
  roleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  roleOptions: { gap: Spacing.sm },
  roleCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: 'rgba(108,99,255,0.07)' },
  roleCardLeft:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  roleTextCol:  { flex: 1 },
  roleTitle:    { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  roleTitleActive: { color: Colors.primary },
  roleDesc:     { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 15,
    gap: 8,
    marginTop: Spacing.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { fontSize: 16, fontWeight: '700', color: Colors.white },

  bottomPad: { height: Spacing.xxl },
});

export default CreateUserScreen;
