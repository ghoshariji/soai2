import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Typography } from '@/theme';
import Button from '@/components/common/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}) => {
  return (
    <View style={styles.container}>
      {/* Icon */}
      {icon ? (
        <View style={styles.iconWrapper}>
          <Icon name={icon} size={48} color={Colors.textMuted} />
        </View>
      ) : null}

      {/* Title */}
      <Text style={styles.title}>{title}</Text>

      {/* Message */}
      <Text style={styles.message}>{message}</Text>

      {/* Optional action button */}
      {actionLabel && onAction ? (
        <View style={styles.actionWrap}>
          <Button title={actionLabel} onPress={onAction} size="md" />
        </View>
      ) : null}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    backgroundColor: Colors.bg,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    ...Typography.body2,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  actionWrap: {
    marginTop: Spacing.xl,
    width: '100%',
    maxWidth: 280,
    paddingHorizontal: Spacing.lg,
  },
});

export default EmptyState;
