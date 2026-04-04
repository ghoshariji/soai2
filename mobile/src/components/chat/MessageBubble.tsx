import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Avatar from '@/components/common/Avatar';
import { Colors, Spacing, Radius } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface Message {
  _id: string;
  content: string;
  senderId: string;
  createdAt: string;
  readBy: string[];
  type: MessageType;
}

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  senderName?: string;
  senderPhoto?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.72;

function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Read receipt tick component
// ---------------------------------------------------------------------------

interface TicksProps {
  readBy: string[];
  currentUserId: string;
  otherParticipantsExist: boolean;
}

const ReadTicks: React.FC<TicksProps> = ({
  readBy,
  currentUserId,
  otherParticipantsExist,
}) => {
  // Double tick = delivered to at least one other participant
  // Blue double tick = read by at least one other participant
  const othersRead = readBy.some((id) => id !== currentUserId);
  const delivered = otherParticipantsExist;

  if (!delivered) {
    // Single tick: sent but not yet delivered
    return <Icon name="checkmark-outline" size={14} color={Colors.textMuted} />;
  }

  return (
    <View style={tickStyles.row}>
      <Icon
        name="checkmark-done-outline"
        size={14}
        color={othersRead ? Colors.info : Colors.textMuted}
      />
    </View>
  );
};

const tickStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

// ---------------------------------------------------------------------------
// System message
// ---------------------------------------------------------------------------

const SystemMessage: React.FC<{ content: string }> = ({ content }) => (
  <View style={sysStyles.container}>
    <Text style={sysStyles.text}>{content}</Text>
  </View>
);

const sysStyles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  text: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUserId,
  senderName,
  senderPhoto,
}) => {
  const isOwn = message.senderId === currentUserId;

  if (message.type === 'system') {
    return <SystemMessage content={message.content} />;
  }

  if (isOwn) {
    return (
      <View style={styles.ownRow}>
        {/* Bubble */}
        <View style={[styles.bubble, styles.ownBubble]}>
          <Text style={styles.ownText} selectable>
            {message.content}
          </Text>
          {/* Footer: time + read receipt */}
          <View style={styles.ownFooter}>
            <Text style={styles.ownTime}>{formatTime(message.createdAt)}</Text>
            <ReadTicks
              readBy={message.readBy}
              currentUserId={currentUserId}
              otherParticipantsExist
            />
          </View>
        </View>
      </View>
    );
  }

  // Other person's message
  return (
    <View style={styles.otherRow}>
      {/* Avatar */}
      <Avatar
        uri={senderPhoto}
        name={senderName ?? '?'}
        size="sm"
        style={styles.avatar}
      />

      <View style={styles.otherColumn}>
        {/* Sender name */}
        {senderName ? (
          <Text style={styles.senderName} numberOfLines={1}>
            {senderName}
          </Text>
        ) : null}

        {/* Bubble */}
        <View style={[styles.bubble, styles.otherBubble]}>
          <Text style={styles.otherText} selectable>
            {message.content}
          </Text>
          <Text style={styles.otherTime}>{formatTime(message.createdAt)}</Text>
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Own message row
  ownRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 3,
    marginHorizontal: Spacing.md,
  },
  ownBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  ownText: {
    fontSize: 15,
    color: Colors.white,
    lineHeight: 21,
  },
  ownFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  ownTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },

  // Other message row
  otherRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 3,
    marginHorizontal: Spacing.md,
  },
  avatar: {
    marginRight: 8,
    marginBottom: 2,
  },
  otherColumn: {
    maxWidth: MAX_BUBBLE_WIDTH,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 3,
    marginLeft: 4,
  },
  otherBubble: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  otherText: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  otherTime: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'right',
  },

  // Shared bubble base
  bubble: {
    maxWidth: MAX_BUBBLE_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
  },
});

export default MessageBubble;
