import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '@/theme';
import { useAppSelector } from '../../store/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  SuperAdminDashboard: undefined;
  SocietyAdminDashboard: undefined;
  UserHome: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

const { width } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SplashScreen: React.FC<Props> = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;
  const dotAnim1 = useRef(new Animated.Value(0)).current;
  const dotAnim2 = useRef(new Animated.Value(0)).current;
  const dotAnim3 = useRef(new Animated.Value(0)).current;

  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    // Logo entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Tagline fades in after logo
      Animated.timing(taglineAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      // Loading dots pulse animation
      const dotPulse = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1,
              duration: 350,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 350,
              useNativeDriver: true,
            }),
          ]),
        );

      dotPulse(dotAnim1, 0).start();
      dotPulse(dotAnim2, 200).start();
      dotPulse(dotAnim3, 400).start();
    });

    // Navigate after 2 seconds
    const timer = setTimeout(() => {
      if (isAuthenticated && user) {
        switch (user.role) {
          case 'super_admin':
            navigation.replace('SuperAdminDashboard');
            break;
          case 'society_admin':
            navigation.replace('SocietyAdminDashboard');
            break;
          default:
            navigation.replace('UserHome');
        }
      } else {
        navigation.replace('Login');
      }
    }, 2200);

    return () => clearTimeout(timer);
  }, [isAuthenticated, user, navigation, fadeAnim, scaleAnim, taglineAnim, dotAnim1, dotAnim2, dotAnim3]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* Background decorative circles */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      {/* Logo block */}
      <Animated.View
        style={[
          styles.logoWrapper,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Icon mark */}
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>S</Text>
          <View style={styles.logoAccent} />
        </View>

        {/* Word mark */}
        <View style={styles.wordMark}>
          <Text style={styles.logoText}>
            <Text style={styles.logoTextBrand}>SocietyWale</Text>
          </Text>
          <View style={styles.logoUnderline} />
        </View>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={[styles.taglineWrapper, { opacity: taglineAnim }]}>
        <Text style={styles.tagline}>Society Management Platform</Text>
        <Text style={styles.taglineSub}>Powered by AI</Text>
      </Animated.View>

      {/* Loading indicator */}
      <Animated.View style={[styles.loadingRow, { opacity: taglineAnim }]}>
        <Animated.View style={[styles.dot, { opacity: dotAnim1 }]} />
        <Animated.View style={[styles.dot, { opacity: dotAnim2 }]} />
        <Animated.View style={[styles.dot, { opacity: dotAnim3 }]} />
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>v1.0.0</Text>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgCircle1: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(79, 70, 229, 0.07)',
  },
  bgCircle2: {
    position: 'absolute',
    bottom: -100,
    left: -60,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(79, 70, 229, 0.05)',
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoMark: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  logoMarkText: {
    fontSize: 44,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -1,
  },
  logoAccent: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  wordMark: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 36,
    letterSpacing: 8,
    fontWeight: '300',
    color: Colors.textPrimary,
  },
  logoTextBrand: {
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 6,
  },
  logoUnderline: {
    marginTop: 6,
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
  taglineWrapper: {
    alignItems: 'center',
    marginBottom: 48,
  },
  tagline: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  taglineSub: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
});

export default SplashScreen;
