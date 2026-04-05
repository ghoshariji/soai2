import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  KeyboardTypeOptions,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  interpolate,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Radius } from '@/theme';

const AnimatedView = Animated.createAnimatedComponent(View);

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: KeyboardTypeOptions;
  editable?: boolean;
  style?: ViewStyle;
  /** `constrained`: max 90% width, centered — ideal for auth & narrow forms */
  layout?: 'full' | 'constrained';
  onBlur?: () => void;
}

const Input: React.FC<InputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  error,
  leftIcon,
  rightIcon,
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  editable = true,
  style,
  layout = 'full',
  onBlur,
}) => {
  const { width: screenW } = useWindowDimensions();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const focus = useSharedValue(0);

  const isPassword = secureTextEntry;
  const secure = isPassword && !showPassword;

  useEffect(() => {
    focus.value = withTiming(isFocused && !error ? 1 : 0, { duration: 180 });
  }, [isFocused, error, focus]);

  const animatedContainer = useAnimatedStyle(() => {
    const borderColor = error
      ? Colors.error
      : interpolateColor(focus.value, [0, 1], [Colors.border, Colors.primary]);

    return {
      borderColor,
      shadowOpacity: error ? 0 : interpolate(focus.value, [0, 1], [0, 0.18]),
      shadowRadius: interpolate(focus.value, [0, 1], [0, 10]),
    };
  });

  const constrainedStyle =
    layout === 'constrained'
      ? { width: Math.min(screenW * 0.9, 420), alignSelf: 'center' as const }
      : undefined;

  return (
    <View style={[styles.wrapper, constrainedStyle, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <AnimatedView
        style={[
          styles.container,
          animatedContainer,
          Platform.OS === 'android' && isFocused && !error && styles.androidFocusElev,
          multiline && styles.multilineContainer,
          !editable && styles.disabled,
        ]}
      >
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}

        <TextInput
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeft : undefined,
            rightIcon || isPassword ? styles.inputWithRight : undefined,
            multiline && styles.multilineInput,
          ]}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : undefined}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          autoCapitalize={isPassword ? 'none' : 'sentences'}
          autoCorrect={!isPassword}
          textAlignVertical={multiline ? 'top' : 'center'}
          selectionColor={Colors.primary}
        />

        {isPassword ? (
          <TouchableOpacity
            style={styles.rightIcon}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        ) : null}

        {!isPassword && rightIcon ? (
          <View style={styles.rightIcon}>{rightIcon}</View>
        ) : null}
      </AnimatedView>

      {error ? (
        <View style={styles.errorRow}>
          <Icon name="alert-circle-outline" size={13} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
    borderWidth: 1.5,
    borderRadius: Radius.input,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
  },
  androidFocusElev: {
    elevation: 3,
  },
  multilineContainer: {
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  disabled: {
    opacity: 0.6,
  },
  leftIcon: {
    marginRight: Spacing.sm,
  },
  rightIcon: {
    marginLeft: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  inputWithLeft: {
    marginLeft: 0,
  },
  inputWithRight: {
    marginRight: 0,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    flex: 1,
  },
});

export default React.memo(Input);
