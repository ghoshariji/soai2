import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius } from '@/theme';
import { useTheme } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { logoutThunk } from '@/store/slices/authSlice';

const SettingsScreen: React.FC = () => {
  const { mode, isDark, toggleTheme } = useTheme();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

  const signOut = () => {
    Alert.alert('Sign out', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void dispatch(logoutThunk());
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.sub}>Super admin preferences</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Account</Text>
        <View style={styles.card}>
          <Row icon="person-outline" label="Name" value={user?.name ?? '—'} />
          <Row icon="mail-outline" label="Email" value={user?.email ?? '—'} />
          <Row
            icon="shield-outline"
            label="Role"
            value={user?.role?.replace(/_/g, ' ') ?? '—'}
          />
        </View>

        <Text style={styles.section}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Icon name={isDark ? 'moon-outline' : 'sunny-outline'} size={22} color={Colors.primary} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Dark mode</Text>
                <Text style={styles.rowHint}>
                  Currently {mode === 'dark' ? 'dark' : 'light'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: Colors.border, true: `${Colors.primary}88` }}
              thumbColor={isDark ? Colors.primary : Colors.textMuted}
            />
          </View>
        </View>

        <Text style={styles.section}>Session</Text>
        <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.85}>
          <Icon name="log-out-outline" size={22} color={Colors.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>SocietyWale Super Admin · v1</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

function Row(props: { icon: string; label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Icon name={props.icon} size={20} color={Colors.textMuted} />
      <View style={rowStyles.textCol}>
        <Text style={rowStyles.lab}>{props.label}</Text>
        <Text style={rowStyles.val}>{props.value}</Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  textCol: { flex: 1 },
  lab: { fontSize: 12, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  val: { fontSize: 15, color: Colors.textPrimary, fontWeight: '600', marginTop: 2 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  rowHint: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error,
    marginTop: Spacing.sm,
  },
  signOutText: { color: Colors.error, fontWeight: '700', fontSize: 16 },
  footer: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, marginTop: Spacing.xl },
});

export default SettingsScreen;
