import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionItem {
  icon: string;
  onPress: () => void;
  badge?: number;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: ActionItem;
  rightAction?: ActionItem;
  showBack?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  leftAction,
  rightAction,
  showBack = false,
}) => {
  const navigation = useNavigation();

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Left slot */}
      <View style={styles.side}>
        {showBack && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        {!showBack && leftAction && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={leftAction.onPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name={leftAction.icon} size={22} color={Colors.textPrimary} />
            {leftAction.badge && leftAction.badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {leftAction.badge > 99 ? '99+' : leftAction.badge}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      </View>

      {/* Center: title + subtitle */}
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Right slot */}
      <View style={styles.side}>
        {rightAction && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={rightAction.onPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name={rightAction.icon} size={22} color={Colors.textPrimary} />
            {rightAction.badge && rightAction.badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {rightAction.badge > 99 ? '99+' : rightAction.badge}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STATUS_BAR_HEIGHT =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: STATUS_BAR_HEIGHT + Spacing.sm,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 56 + STATUS_BAR_HEIGHT,
  },
  side: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.error,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.bg,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
});

export default Header;
