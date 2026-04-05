import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { notify } from '@/utils/toast';
import { Colors, Spacing, Radius } from '@/theme';
import { useResponsive } from '@/utils/layout';
import { forgotPasswordSchema } from '@/utils/validation/authSchemas';
import { authService } from '@/services/api';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

type FormValues = { email: string };

const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const [submitting, setSubmitting] = useState(false);
  const r = useResponsive();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await authService.forgotPassword(values.email.trim().toLowerCase());
      notify.success(
        'Check your email',
        'If an account exists, reset instructions were sent.',
      );
      navigation.navigate('ResetPassword');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
          : '';
      notify.error('Request failed', msg || 'Could not send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingHorizontal: r.gutter, paddingTop: Spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
        <View
          style={{
            width: '100%',
            maxWidth: Math.min(440, r.width - r.gutter * 2),
            alignSelf: 'center',
          }}
        >
        <TouchableOpacity
          style={styles.back}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Icon name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.sub}>
          Enter your account email. We will send a one-time reset token (valid 15
          minutes).
        </Text>

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              layout="constrained"
              label="Email"
              placeholder="you@example.com"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email?.message}
              leftIcon={
                <Icon name="mail-outline" size={18} color={Colors.textMuted} />
              }
            />
          )}
        />

        <Button
          title="Send reset link"
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          disabled={submitting}
          size="lg"
          style={styles.btn}
        />

        <TouchableOpacity onPress={() => navigation.navigate('ResetPassword')}>
          <Text style={styles.link}>I already have a token → Reset password</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  scroll: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
  },
  back: { marginBottom: Spacing.lg, alignSelf: 'flex-start' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  sub: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
    marginBottom: Spacing.xl,
  },
  btn: { marginTop: Spacing.md },
  link: {
    marginTop: Spacing.lg,
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ForgotPasswordScreen;
