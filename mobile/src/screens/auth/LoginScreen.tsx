import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Radius } from '@/theme';
import { loginThunk } from '../../store/slices/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/index';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useResponsive } from '@/utils/layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Email is required';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email.trim())) return 'Enter a valid email address';
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  return undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const { isLoading, error } = useAppSelector((state) => state.auth);
  const r = useResponsive();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [touched, setTouched] = useState({ email: false, password: false });

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const errorShakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Shake animation when server error occurs
  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(errorShakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(errorShakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(errorShakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
        Animated.timing(errorShakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(errorShakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [error, errorShakeAnim]);

  const handleLogin = useCallback(async () => {
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    setTouched({ email: true, password: true });
    if (eErr || pErr) return;

    dispatch(
      loginThunk({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      }),
    );
    // Navigation is handled automatically by AppNavigator reacting to
    // isAuthenticated in Redux auth state — no manual navigation needed here.
  }, [dispatch, email, password]);

  const handleForgotPassword = useCallback(() => {
    navigation.navigate('ForgotPassword');
  }, [navigation]);

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

        <View style={styles.bgOrb1} />
        <View style={styles.bgOrb2} />

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: r.gutter,
              paddingTop: Math.min(Math.max(Spacing.xl, r.height * 0.05), 72),
              paddingBottom: Spacing.xxl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View
          style={{
            width: '100%',
            maxWidth: Math.min(440, r.width - r.gutter * 2),
            alignSelf: 'center',
          }}
        >
        {/* ── Header / Branding ── */}
        <Animated.View
          style={[
            styles.headerSection,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Logo mark */}
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>S</Text>
            <View style={styles.logoAccentDot} />
          </View>

          {/* Gradient-style layered text title */}
          <View style={styles.titleRow}>
            <Text style={styles.titlePrimary}>Welcome to </Text>
            <Text style={styles.titleBrand}>SOAI</Text>
          </View>
          <Text style={styles.subtitle}>
            Sign in with your role-assigned account (Super Admin, Society Admin,
            or Resident). Your role is detected after login.
          </Text>
        </Animated.View>

        {/* ── Form Card ── */}
        <Animated.View
          style={[
            styles.formCard,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Server error banner */}
          {error ? (
            <Animated.View
              style={[
                styles.errorBanner,
                { transform: [{ translateX: errorShakeAnim }] },
              ]}
            >
              <Icon
                name="alert-circle"
                size={16}
                color={Colors.error}
                style={styles.errorBannerIcon}
              />
              <Text style={styles.errorBannerText}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Email field */}
          <Input
            layout="constrained"
            label="Email Address"
            placeholder="you@example.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (touched.email) setEmailError(validateEmail(t));
            }}
            keyboardType="email-address"
            error={touched.email ? emailError : undefined}
            leftIcon={
              <Icon name="mail-outline" size={18} color={Colors.textMuted} />
            }
          />

          {/* Password field */}
          <Input
            layout="constrained"
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (touched.password) setPasswordError(validatePassword(t));
            }}
            secureTextEntry
            error={touched.password ? passwordError : undefined}
            leftIcon={
              <Icon name="lock-closed-outline" size={18} color={Colors.textMuted} />
            }
          />

          {/* Forgot password link */}
          <TouchableOpacity
            style={styles.forgotWrapper}
            onPress={handleForgotPassword}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Submit */}
          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading}
            size="lg"
            style={styles.loginButton}
          />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Secure Login</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Security assurance note */}
          <View style={styles.secureNote}>
            <Icon
              name="shield-checkmark-outline"
              size={14}
              color={Colors.success}
            />
            <Text style={styles.secureNoteText}>
              256-bit encrypted connection
            </Text>
          </View>
        </Animated.View>

        {/* ── Footer ── */}
        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <Text style={styles.footerText}>
            SOAI Society Management Platform
          </Text>
          <Text style={styles.footerVersion}>v1.0.0</Text>
        </Animated.View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Background orbs
  bgOrb1: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(79, 70, 229, 0.09)',
  },
  bgOrb2: {
    position: 'absolute',
    bottom: 80,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },

  // Header / branding
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoMark: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  logoMarkText: {
    fontSize: 38,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.5,
  },
  logoAccentDot: {
    position: 'absolute',
    bottom: 11,
    right: 11,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.sm,
  },
  titlePrimary: {
    fontSize: 26,
    fontWeight: '300',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  titleBrand: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },

  // Form card
  formCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.md,
  },
  errorBannerIcon: {
    marginRight: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.error,
    fontWeight: '500',
  },

  // Forgot password
  forgotWrapper: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: Spacing.lg,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  forgotText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },

  // Submit button
  loginButton: {
    marginBottom: Spacing.lg,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // Security note
  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secureNoteText: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  footerVersion: {
    fontSize: 11,
    color: Colors.textMuted,
    opacity: 0.6,
  },
});

export default LoginScreen;
