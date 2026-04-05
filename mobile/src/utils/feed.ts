import type { Post, PostAuthor } from '@/components/feed/PostCard';

function asAuthor(raw: unknown): PostAuthor | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = o._id ?? o.id;
  if (id == null || id === '') return null;
  return {
    _id: String(id),
    name: String(o.name ?? 'Member'),
    profilePhoto: (o.profilePhoto as string | null) ?? null,
    flatNumber: (o.flatNumber as string | null) ?? null,
  };
}

function imageUrlsFromRaw(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'url' in item) {
        return String((item as { url: string }).url);
      }
      return '';
    })
    .filter(Boolean);
}

/** Normalise a post from GET /posts or socket `new_post` payload. */
export function normalizeFeedPost(raw: Record<string, unknown>): Post | null {
  const id = raw._id ?? raw.id;
  if (id == null || id === '') return null;

  const author = asAuthor(raw.authorId);
  if (!author) return null;

  const likesRaw = raw.likes;
  const likeIds = Array.isArray(likesRaw)
    ? likesRaw.map((x) => String(x))
    : [];

  const likesCount =
    typeof raw.likesCount === 'number'
      ? raw.likesCount
      : likeIds.length;

  return {
    _id: String(id),
    content: String(raw.content ?? ''),
    images: imageUrlsFromRaw(raw.images),
    authorId: author,
    likesCount,
    commentsCount: Number(raw.commentsCount ?? 0),
    createdAt:
      typeof raw.createdAt === 'string'
        ? raw.createdAt
        : new Date().toISOString(),
    likes: likeIds,
  };
}

export interface FeedCommentRow {
  _id: string;
  content: string;
  createdAt: string;
  authorId: PostAuthor;
  parentId: string | null;
}

export function normalizeFeedComment(
  raw: Record<string, unknown>,
): FeedCommentRow | null {
  const id = raw._id ?? raw.id;
  if (id == null || id === '') return null;
  const author = asAuthor(raw.authorId);
  if (!author) return null;
  const parent = raw.parentId;
  return {
    _id: String(id),
    content: String(raw.content ?? ''),
    createdAt:
      typeof raw.createdAt === 'string'
        ? raw.createdAt
        : new Date().toISOString(),
    authorId: author,
    parentId: parent ? String(parent) : null,
  };
}
