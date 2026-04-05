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
import { Colors, Spacing } from '@/theme';
import { useResponsive } from '@/utils/layout';
import { resetPasswordSchema } from '@/utils/validation/authSchemas';
import { authService } from '@/services/api';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

type FormValues = {
  token: string;
  newPassword: string;
  confirmNewPassword: string;
};

const ResetPasswordScreen: React.FC<Props> = ({ navigation, route }) => {
  const initialToken = route.params?.token ?? '';
  const [submitting, setSubmitting] = useState(false);
  const r = useResponsive();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(resetPasswordSchema),
    defaultValues: {
      token: initialToken,
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await authService.resetPassword(
        values.token.trim(),
        values.newPassword,
        values.confirmNewPassword,
      );
      notify.success('Password updated', 'Sign in with your new password.');
      navigation.navigate('Login');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
          : '';
      notify.error('Reset failed', msg || 'Invalid or expired token.');
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

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.sub}>
          Paste the token from your email, then choose a strong new password.
        </Text>

        <Controller
          control={control}
          name="token"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              layout="constrained"
              label="Reset token"
              placeholder="64-character token from email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              error={errors.token?.message}
              leftIcon={
                <Icon name="key-outline" size={18} color={Colors.textMuted} />
              }
            />
          )}
        />

        <Controller
          control={control}
          name="newPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              layout="constrained"
              label="New password"
              placeholder="Min 8 chars, upper, number, symbol"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              secureTextEntry
              error={errors.newPassword?.message}
              leftIcon={
                <Icon name="lock-closed-outline" size={18} color={Colors.textMuted} />
              }
            />
          )}
        />

        <Controller
          control={control}
          name="confirmNewPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              layout="constrained"
              label="Confirm password"
              placeholder="Repeat new password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              secureTextEntry
              error={errors.confirmNewPassword?.message}
              leftIcon={
                <Icon name="lock-closed-outline" size={18} color={Colors.textMuted} />
              }
            />
          )}
        />

        <Button
          title="Update password"
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          disabled={submitting}
          size="lg"
          style={styles.btn}
        />
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
});

export default ResetPasswordScreen;
