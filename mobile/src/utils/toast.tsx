import React from 'react';
import Toast, { BaseToast, ToastConfig } from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';

const text1Style = {
  fontSize: 16,
  fontWeight: '700' as const,
  color: Colors.textPrimary,
};

const text2Style = {
  fontSize: 14,
  fontWeight: '400' as const,
  color: Colors.textSecondary,
  marginTop: 2,
};

function toastBase(
  borderLeftColor: string,
  props: Record<string, unknown>,
): React.ReactElement {
  return (
    <BaseToast
      {...props}
      style={{
        borderLeftColor,
        borderLeftWidth: 4,
        backgroundColor: Colors.bgCard,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        height: 'auto',
        minHeight: 64,
        paddingVertical: Spacing.sm,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 4,
      }}
      contentContainerStyle={{ paddingHorizontal: Spacing.md }}
      text1Style={text1Style}
      text2Style={text2Style}
      text1NumberOfLines={2}
      text2NumberOfLines={5}
    />
  );
}

export const toastConfig: ToastConfig = {
  success: (props) => toastBase(Colors.success, props as Record<string, unknown>),
  error: (props) => toastBase(Colors.error, props as Record<string, unknown>),
  info: (props) => toastBase(Colors.info, props as Record<string, unknown>),
};

/** Central toast API — prefer this over raw `Toast.show` for consistent copy & timing. */
export const notify = {
  success: (text1: string, text2?: string) =>
    Toast.show({
      type: 'success',
      text1,
      text2,
      position: 'top',
      visibilityTime: 3200,
    }),

  error: (text1: string, text2?: string) =>
    Toast.show({
      type: 'error',
      text1,
      text2,
      position: 'top',
      visibilityTime: 4200,
    }),

  info: (text1: string, text2?: string) =>
    Toast.show({
      type: 'info',
      text1,
      text2,
      position: 'top',
      visibilityTime: 3000,
    }),
};

export default Toast;
