import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Colors, Spacing, Radius } from '@/theme';

interface AppModalProps {
  visible: boolean;
  title: string;
  children?: React.ReactNode;
  onClose: () => void;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Consistent modal shell: dimmed backdrop, card, optional primary/secondary actions.
 */
const AppModal: React.FC<AppModalProps> = ({
  visible,
  title,
  children,
  onClose,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}) => (
  <Modal
    visible={visible}
    animationType="fade"
    transparent
    onRequestClose={onClose}
  >
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
        <Text style={styles.title}>{title}</Text>
        {children}
        <View style={styles.actions}>
          {secondaryLabel && onSecondary ? (
            <TouchableOpacity style={styles.secondary} onPress={onSecondary}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {primaryLabel && onPrimary ? (
            <TouchableOpacity style={styles.primary} onPress={onPrimary}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Pressable>
    </Pressable>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  primary: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  primaryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  secondary: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
});

export default AppModal;
