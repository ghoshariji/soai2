import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Radius } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatInputProps {
  onSend: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const STOP_TYPING_DELAY = 1500; // ms

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onTyping,
  placeholder = 'Type a message…',
}) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(44);

  // Track whether we have emitted a "typing" event so we can send "stop"
  const isTypingRef = useRef(false);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced "stop typing" emitter
  const scheduleStopTyping = useCallback(() => {
    if (stopTypingTimer.current) {
      clearTimeout(stopTypingTimer.current);
    }
    stopTypingTimer.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTyping?.(false);
      }
    }, STOP_TYPING_DELAY);
  }, [onTyping]);

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value);

      if (value.length > 0) {
        if (!isTypingRef.current) {
          isTypingRef.current = true;
          onTyping?.(true);
        }
        scheduleStopTyping();
      } else {
        // Input is empty – stop typing immediately
        if (stopTypingTimer.current) {
          clearTimeout(stopTypingTimer.current);
        }
        if (isTypingRef.current) {
          isTypingRef.current = false;
          onTyping?.(false);
        }
      }
    },
    [scheduleStopTyping, onTyping],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Clear typing state
    if (stopTypingTimer.current) {
      clearTimeout(stopTypingTimer.current);
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping?.(false);
    }

    onSend(trimmed);
    setText('');
    setInputHeight(44);
    Keyboard.dismiss();
  }, [text, onSend, onTyping]);

  const canSend = text.trim().length > 0;
  const dynamicHeight = Math.min(Math.max(inputHeight, 44), 120);

  return (
    <View style={styles.container}>
      {/* Text input */}
      <View style={[styles.inputWrapper, { minHeight: dynamicHeight }]}>
        <TextInput
          style={[styles.textInput, { height: dynamicHeight }]}
          value={text}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          multiline
          onContentSizeChange={(e) =>
            setInputHeight(e.nativeEvent.contentSize.height + (Platform.OS === 'ios' ? 16 : 8))
          }
          returnKeyType="default"
          blurOnSubmit={false}
          selectionColor={Colors.primary}
          autoCorrect
          autoCapitalize="sentences"
        />
      </View>

      {/* Send button */}
      <TouchableOpacity
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.75}
      >
        <Icon
          name="send"
          size={18}
          color={canSend ? Colors.white : Colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 15,
    color: Colors.textPrimary,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});

export default React.memo(ChatInput);
