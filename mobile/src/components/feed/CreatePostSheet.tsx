import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import Toast from 'react-native-toast-message';
import { postService, getApiErrorMessage } from '@/services/api';
import { Colors, Spacing, Radius } from '@/theme';
import type { Post } from '@/components/feed/PostCard';
import { normalizeFeedPost } from '@/utils/feed';

const MAX_IMAGES = 5;
const MAX_CHARS = 2000;

interface CreatePostSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with normalised post after successful create (for optimistic feed prepend). */
  onCreated: (post: Post) => void;
}

const CreatePostSheet: React.FC<CreatePostSheetProps> = ({
  visible,
  onClose,
  onCreated,
}) => {
  const [text, setText] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setText('');
    setAssets([]);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, onClose, reset]);

  const pickImages = useCallback(async () => {
    const remaining = MAX_IMAGES - assets.length;
    if (remaining <= 0) {
      Toast.show({ type: 'info', text1: `Up to ${MAX_IMAGES} photos` });
      return;
    }
    const res = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.85,
      selectionLimit: remaining,
    });
    if (res.didCancel || !res.assets?.length) return;
    setAssets((prev) => [...prev, ...res.assets!].slice(0, MAX_IMAGES));
  }, [assets.length]);

  const removeAsset = useCallback((index: number) => {
    setAssets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && assets.length === 0) {
      Toast.show({ type: 'error', text1: 'Add text or a photo' });
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      Toast.show({ type: 'error', text1: `Max ${MAX_CHARS} characters` });
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      if (trimmed) fd.append('content', trimmed);
      assets.forEach((a) => {
        if (a.uri) {
          fd.append('images', {
            uri: a.uri,
            type: a.type ?? 'image/jpeg',
            name: a.fileName ?? `photo_${Date.now()}.jpg`,
          } as unknown as Blob);
        }
      });

      const res = await postService.create(fd);
      const raw = res.data.data as Record<string, unknown>;
      const post = normalizeFeedPost(raw);
      if (post) onCreated(post);
      Toast.show({ type: 'success', text1: 'Post published' });
      reset();
      onClose();
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Could not publish',
        text2: getApiErrorMessage(e),
      });
    } finally {
      setSubmitting(false);
    }
  }, [assets, onClose, onCreated, reset, text]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={12} disabled={submitting}>
            <Text style={styles.headerCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New post</Text>
          <TouchableOpacity
            onPress={submit}
            disabled={submitting}
            hitSlop={12}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.headerPost}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={styles.input}
            placeholder="What’s on your mind?"
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={MAX_CHARS}
            value={text}
            onChangeText={setText}
            editable={!submitting}
          />
          <Text style={styles.counter}>
            {text.trim().length}/{MAX_CHARS}
          </Text>

          <TouchableOpacity
            style={styles.pickRow}
            onPress={pickImages}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Icon name="images-outline" size={22} color={Colors.primary} />
            <Text style={styles.pickLabel}>Add photos</Text>
            <Text style={styles.pickHint}>
              {assets.length}/{MAX_IMAGES}
            </Text>
          </TouchableOpacity>

          <View style={styles.thumbs}>
            {assets.map((a, i) => (
              <View key={`${a.uri ?? i}`} style={styles.thumbWrap}>
                {a.uri ? (
                  <Image source={{ uri: a.uri }} style={styles.thumb} />
                ) : null}
                <TouchableOpacity
                  style={styles.thumbRemove}
                  onPress={() => removeAsset(i)}
                  disabled={submitting}
                >
                  <Icon name="close-circle" size={22} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  headerCancel: { fontSize: 16, color: Colors.textSecondary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerPost: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  input: {
    minHeight: 120,
    fontSize: 16,
    color: Colors.textPrimary,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  pickHint: { fontSize: 13, color: Colors.textMuted },
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  thumbWrap: {
    width: 88,
    height: 88,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
  },
});

export default CreatePostSheet;
