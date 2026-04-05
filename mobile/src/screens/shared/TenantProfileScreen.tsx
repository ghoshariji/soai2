import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';

import { Colors, Spacing, Radius } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { updateUser, logoutThunk } from '@/store/slices/authSlice';
import { userService, authService } from '@/services/api';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';

const TenantProfileScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const reduxUser = useAppSelector((s) => s.auth.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authService.getMe();
      const u = res.data.data as Record<string, unknown>;
      setName(String(u.name ?? ''));
      setPhone(String(u.phone ?? ''));
      setProfileUrl((u.profilePhoto as string) || null);
      setPhotoUri(null);
      dispatch(
        updateUser({
          name: String(u.name ?? ''),
          profilePhoto: (u.profilePhoto as string) || null,
          flatNumber: (u.flatNumber as string) ?? null,
        }),
      );
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load profile' });
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const pickPhoto = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    if (res.didCancel || !res.assets?.[0]?.uri) return;
    setPhotoUri(res.assets[0].uri);
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Name is required' });
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('phone', phone.trim());
      if (photoUri) {
        form.append('profilePhoto', {
          uri: photoUri,
          name: 'profile.jpg',
          type: 'image/jpeg',
        } as unknown as Blob);
      }
      const res = await userService.updateProfile(form);
      const u = res.data.data as Record<string, unknown>;
      dispatch(
        updateUser({
          name: String(u.name ?? name),
          profilePhoto: (u.profilePhoto as string) || profileUrl,
        }),
      );
      setProfileUrl((u.profilePhoto as string) || profileUrl);
      setPhotoUri(null);
      Toast.show({ type: 'success', text1: 'Profile updated' });
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { message?: string } } }).response?.data
                ?.message ?? '',
            )
          : 'Update failed';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!curPwd || !newPwd || !confirmPwd) {
      Toast.show({ type: 'error', text1: 'Fill all password fields' });
      return;
    }
    if (newPwd !== confirmPwd) {
      Toast.show({ type: 'error', text1: 'New passwords do not match' });
      return;
    }
    setPwdBusy(true);
    try {
      await authService.changePassword(curPwd, newPwd, confirmPwd);
      setCurPwd('');
      setNewPwd('');
      setConfirmPwd('');
      Toast.show({
        type: 'success',
        text1: 'Password changed',
        text2: 'Please sign in again.',
      });
      await dispatch(logoutThunk());
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { message?: string } } }).response?.data
                ?.message ?? '',
            )
          : 'Failed';
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setPwdBusy(false);
    }
  };

  const displayPhoto = photoUri || profileUrl || reduxUser?.profilePhoto;

  if (loading) {
    return (
      <View style={styles.safe}>
        <Header title="Profile" />
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Header title="My profile" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.avatarWrap} onPress={pickPhoto} activeOpacity={0.85}>
          {displayPhoto ? (
            <Image source={{ uri: displayPhoto }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPh}>
              <Icon name="person" size={48} color={Colors.textMuted} />
            </View>
          )}
          <View style={styles.camBadge}>
            <Icon name="camera" size={16} color={Colors.white} />
          </View>
        </TouchableOpacity>
        <Text style={styles.email}>{reduxUser?.email}</Text>
        <Text style={styles.role}>{reduxUser?.role?.replace('_', ' ')}</Text>

        <Input label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
        <Input
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="+91…"
          keyboardType="phone-pad"
        />

        <Button
          title={saving ? 'Saving…' : 'Save profile'}
          onPress={saveProfile}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
        />

        <Text style={styles.section}>Change password</Text>
        <Input
          label="Current password"
          value={curPwd}
          onChangeText={setCurPwd}
          secureTextEntry
        />
        <Input
          label="New password"
          value={newPwd}
          onChangeText={setNewPwd}
          secureTextEntry
          placeholder="8+ chars, upper, number, symbol"
        />
        <Input
          label="Confirm new password"
          value={confirmPwd}
          onChangeText={setConfirmPwd}
          secureTextEntry
        />
        <Button
          title={pwdBusy ? 'Updating…' : 'Update password'}
          onPress={changePassword}
          loading={pwdBusy}
          variant="outline"
          style={styles.saveBtn}
        />

        <TouchableOpacity
          style={styles.logout}
          onPress={() => dispatch(logoutThunk())}
        >
          <Icon name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarWrap: { alignSelf: 'center', marginBottom: Spacing.md },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarPh: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  email: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 14,
    marginBottom: 4,
  },
  role: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 12,
    textTransform: 'capitalize',
    marginBottom: Spacing.lg,
  },
  saveBtn: { marginTop: Spacing.md },
  section: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.xl,
    padding: Spacing.md,
  },
  logoutText: { color: Colors.error, fontWeight: '700', fontSize: 16 },
});

export default TenantProfileScreen;
