import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Avatar from '@/components/common/Avatar';
import Card from '@/components/common/Card';
import { Colors, Spacing, Radius } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostAuthor {
  _id: string;
  name: string;
  profilePhoto: string | null;
  flatNumber: string | null;
}

export interface Post {
  _id: string;
  content: string;
  images: string[];
  authorId: PostAuthor;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  likes: string[];
}

interface PostCardProps {
  post: Post;
  currentUserId: string;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onPress?: (postId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_WIDTH - Spacing.md * 2 - 2; // card horizontal padding

function formatTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUserId,
  onLike,
  onComment,
  onDelete,
  onPress,
}) => {
  const isLiked = post.likes.includes(currentUserId);
  const isOwner = post.authorId._id === currentUserId;

  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  const handleDelete = () => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(post._id),
        },
      ],
    );
  };

  return (
    <Card
      style={styles.card}
      onPress={onPress ? () => onPress(post._id) : undefined}
    >
      {/* Header: author info */}
      <View style={styles.header}>
        <Avatar
          uri={post.authorId.profilePhoto}
          name={post.authorId.name}
          size="md"
        />
        <View style={styles.authorInfo}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.authorId.name}
          </Text>
          <View style={styles.metaRow}>
            {post.authorId.flatNumber ? (
              <>
                <Icon name="home-outline" size={11} color={Colors.textMuted} />
                <Text style={styles.flatText}>{post.authorId.flatNumber}</Text>
                <Text style={styles.metaDot}>·</Text>
              </>
            ) : null}
            <Text style={styles.timeText}>{formatTimeAgo(post.createdAt)}</Text>
          </View>
        </View>

        {/* Delete button (owner only) */}
        {isOwner && onDelete ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Content */}
      {post.content ? (
        <Text style={styles.content}>{post.content}</Text>
      ) : null}

      {/* Images */}
      {post.images && post.images.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.imagesScroll}
          contentContainerStyle={styles.imagesContent}
          scrollEnabled={post.images.length > 1}
        >
          {post.images.map((uri, idx) => (
            <View key={idx} style={[
              styles.imageWrapper,
              post.images.length === 1 && styles.singleImageWrapper,
              idx < post.images.length - 1 && styles.imageMarginRight,
            ]}>
              {!imageError[idx] ? (
                <Image
                  source={{ uri }}
                  style={[
                    styles.image,
                    post.images.length === 1 && styles.singleImage,
                  ]}
                  resizeMode="cover"
                  onError={() =>
                    setImageError((prev) => ({ ...prev, [idx]: true }))
                  }
                />
              ) : (
                <View style={[styles.imagePlaceholder, post.images.length === 1 && styles.singleImage]}>
                  <Icon name="image-outline" size={32} color={Colors.textMuted} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* Footer: like + comment counts */}
      <View style={styles.footer}>
        {/* Like button */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onLike(post._id)}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Icon
            name={isLiked ? 'heart' : 'heart-outline'}
            size={20}
            color={isLiked ? Colors.error : Colors.textSecondary}
          />
          {post.likesCount > 0 ? (
            <Text
              style={[
                styles.actionCount,
                isLiked && styles.likedCount,
              ]}
            >
              {post.likesCount}
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* Comment button */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSpaced]}
          onPress={() => onComment(post._id)}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Icon name="chatbubble-outline" size={19} color={Colors.textSecondary} />
          {post.commentsCount > 0 ? (
            <Text style={styles.actionCount}>{post.commentsCount}</Text>
          ) : null}
        </TouchableOpacity>

        {/* Spacer */}
        <View style={styles.footerSpacer} />
      </View>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    paddingBottom: 10,
  },
  authorInfo: {
    flex: 1,
    marginLeft: 10,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  flatText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  metaDot: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  timeText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
    paddingBottom: 12,
  },
  imagesScroll: {
    marginBottom: 12,
  },
  imagesContent: {
    paddingHorizontal: Spacing.md,
  },
  imageWrapper: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    height: 200,
    width: 220,
  },
  singleImageWrapper: {
    width: IMAGE_SIZE,
    height: 240,
  },
  imageMarginRight: {
    marginRight: Spacing.sm,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  singleImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionBtnSpaced: {
    marginLeft: Spacing.md,
  },
  actionCount: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  likedCount: {
    color: Colors.error,
  },
  footerSpacer: {
    flex: 1,
  },
});

export default PostCard;
