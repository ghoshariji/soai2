import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { chatService } from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | string;

export interface MessageReadEntry {
  userId: string;
  readAt: string;
}

export interface Message {
  _id: string;
  type: MessageType;
  /** ID of the sender user. */
  senderId: string;
  /** Set for personal (1-to-1) messages. */
  receiverId: string | null;
  /** Set for group messages. */
  groupId: string | null;
  content: string;
  mediaUrl: string | null;
  /** Array of users who have read this message. */
  readBy: MessageReadEntry[];
  createdAt: string;
  /** Optimistic-update flag – true while the message hasn't been ACK'd. */
  isPending?: boolean;
  /** Set when the message failed to send. */
  isFailed?: boolean;
}

export interface Conversation {
  /** The peer's userId for 1-to-1 chats, groupId for group chats. */
  id: string;
  /** Mirrors the id field for explicit distinction when needed. */
  userId: string | null;
  groupId: string | null;
  name: string;
  profilePhoto: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isGroup: boolean;
  /** Online status – only relevant for 1-to-1 conversations. */
  isOnline?: boolean;
}

export interface ChatState {
  /** Keyed by roomId (userId for personal, groupId for group). */
  messages: Record<string, Message[]>;
  conversations: Conversation[];
  activeRoom: string | null;
  isLoading: boolean;
  error: string | null;
  /** Keyed by roomId; value is array of userIds currently typing. */
  typingUsers: Record<string, string[]>;
  /** Keyed by roomId; tracks whether older messages have been fully loaded. */
  hasMoreMessages: Record<string, boolean>;
  /** Keyed by roomId; tracks the current fetched page. */
  messagePage: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseMessage(raw: Record<string, unknown>): Message {
  return {
    _id: (raw._id ?? raw.id ?? '') as string,
    type: (raw.type ?? 'text') as MessageType,
    senderId: (raw.senderId ?? raw.sender ?? '') as string,
    receiverId: (raw.receiverId ?? raw.receiver ?? null) as string | null,
    groupId: (raw.groupId ?? raw.group ?? null) as string | null,
    content: (raw.content ?? raw.text ?? '') as string,
    mediaUrl: (raw.mediaUrl ?? raw.media ?? null) as string | null,
    readBy: Array.isArray(raw.readBy)
      ? (raw.readBy as MessageReadEntry[])
      : [],
    createdAt: (raw.createdAt ?? new Date().toISOString()) as string,
  };
}

function normaliseConversation(raw: Record<string, unknown>): Conversation {
  const isGroup = Boolean(raw.isGroup ?? raw.groupId);
  const id = (
    isGroup
      ? (raw.groupId ?? raw.id ?? raw._id)
      : (raw.userId ?? raw.id ?? raw._id)
  ) as string;

  return {
    id,
    userId: isGroup ? null : (id as string),
    groupId: isGroup ? (id as string) : null,
    name: (raw.name ?? 'Unknown') as string,
    profilePhoto: (raw.profilePhoto ?? raw.avatar ?? null) as string | null,
    lastMessage: (raw.lastMessage ?? null) as string | null,
    lastMessageAt: (raw.lastMessageAt ?? raw.updatedAt ?? null) as string | null,
    unreadCount: Number(raw.unreadCount ?? 0),
    isGroup,
    isOnline: Boolean(raw.isOnline ?? false),
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const axiosMessage = (
      error as { response?: { data?: { message?: string } } }
    ).response?.data?.message;
    return axiosMessage ?? error.message;
  }
  return typeof error === 'string' ? error : 'An unexpected error occurred.';
}

/** Merge a new batch of messages into an existing array without duplicates. */
function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const map = new Map(existing.map((m) => [m._id, m]));
  for (const msg of incoming) {
    if (!map.has(msg._id)) {
      map.set(msg._id, msg);
    }
  }
  // Sort ascending by createdAt
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: ChatState = {
  messages: {},
  conversations: [],
  activeRoom: null,
  isLoading: false,
  error: null,
  typingUsers: {},
  hasMoreMessages: {},
  messagePage: {},
};

// ---------------------------------------------------------------------------
// Async thunks
// ---------------------------------------------------------------------------

/**
 * Fetch all conversations (1-to-1 + group) for the current user.
 */
export const fetchConversations = createAsyncThunk<
  Conversation[],
  void,
  { rejectValue: string }
>('chat/fetchConversations', async (_, { rejectWithValue }) => {
  try {
    const { data } = await chatService.getConversations();
    return (data.data as Record<string, unknown>[]).map(normaliseConversation);
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Fetch personal (1-to-1) messages with a specific user.
 * Supports pagination – pass page > 1 to load older messages.
 */
export const fetchPersonalMessages = createAsyncThunk<
  { roomId: string; messages: Message[]; page: number; totalPages: number },
  { userId: string; page?: number; limit?: number },
  { rejectValue: string }
>(
  'chat/fetchPersonalMessages',
  async ({ userId, page = 1, limit = 30 }, { rejectWithValue }) => {
    try {
      const { data } = await chatService.getPersonalMessages(userId, {
        page,
        limit,
      });
      const messages = (data.data as Record<string, unknown>[]).map(
        normaliseMessage,
      );
      return { roomId: userId, messages, page, totalPages: data.totalPages ?? 1 };
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  },
);

/**
 * Fetch messages for a specific group room.
 * Supports pagination – pass page > 1 to load older messages.
 */
export const fetchGroupMessages = createAsyncThunk<
  { roomId: string; messages: Message[]; page: number; totalPages: number },
  { groupId: string; page?: number; limit?: number },
  { rejectValue: string }
>(
  'chat/fetchGroupMessages',
  async ({ groupId, page = 1, limit = 30 }, { rejectWithValue }) => {
    try {
      const { data } = await chatService.getGroupMessages(groupId, {
        page,
        limit,
      });
      const messages = (data.data as Record<string, unknown>[]).map(
        normaliseMessage,
      );
      return { roomId: groupId, messages, page, totalPages: data.totalPages ?? 1 };
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    /**
     * Append an incoming real-time message to the correct room.
     * Also updates the matching conversation's last message + unread count.
     */
    addMessage(
      state,
      action: PayloadAction<Message | Record<string, unknown>>,
    ) {
      const raw = action.payload as Record<string, unknown>;
      const message: Message =
        typeof raw._id === 'string' && typeof raw.senderId === 'string'
          ? (raw as unknown as Message)
          : normaliseMessage(raw);

      const roomId =
        message.groupId ??
        // For personal messages we key by the OTHER party's id.
        // The consumer is responsible for passing the correct roomId
        // via the data field when dispatching from a socket handler.
        (raw.roomId as string | undefined) ??
        message.receiverId ??
        message.senderId;

      if (!roomId) {
        return;
      }

      if (!state.messages[roomId]) {
        state.messages[roomId] = [];
      }

      // Avoid duplicates (real-time + fetch overlap)
      const exists = state.messages[roomId].some((m) => m._id === message._id);
      if (!exists) {
        state.messages[roomId].push(message);
      }

      // Replace an optimistic (pending) message if it shares a tempId
      const tempId = raw.tempId as string | undefined;
      if (tempId) {
        const pendingIndex = state.messages[roomId].findIndex(
          (m) => m._id === tempId,
        );
        if (pendingIndex !== -1) {
          state.messages[roomId].splice(pendingIndex, 1);
        }
      }

      // Update conversation preview
      const convIndex = state.conversations.findIndex(
        (c) => c.id === roomId,
      );
      if (convIndex !== -1) {
        const conv = state.conversations[convIndex];
        conv.lastMessage = message.content || (message.mediaUrl ? '📎 Media' : '');
        conv.lastMessageAt = message.createdAt;
        // Only increment unread when the room is not active
        if (state.activeRoom !== roomId) {
          conv.unreadCount += 1;
        }
        // Bubble conversation to top
        state.conversations.splice(convIndex, 1);
        state.conversations.unshift(conv);
      }
    },

    /**
     * Append an optimistic (pending) message before the server responds.
     */
    addOptimisticMessage(
      state,
      action: PayloadAction<{ roomId: string; message: Message }>,
    ) {
      const { roomId, message } = action.payload;
      if (!state.messages[roomId]) {
        state.messages[roomId] = [];
      }
      state.messages[roomId].push({ ...message, isPending: true });
    },

    /**
     * Mark an optimistic message as failed.
     */
    markMessageFailed(
      state,
      action: PayloadAction<{ roomId: string; tempId: string }>,
    ) {
      const { roomId, tempId } = action.payload;
      const messages = state.messages[roomId];
      if (!messages) return;
      const msg = messages.find((m) => m._id === tempId);
      if (msg) {
        msg.isPending = false;
        msg.isFailed = true;
      }
    },

    /**
     * Set the currently open chat room and reset its unread count.
     */
    setActiveRoom(state, action: PayloadAction<string | null>) {
      state.activeRoom = action.payload;

      if (action.payload) {
        const conv = state.conversations.find((c) => c.id === action.payload);
        if (conv) {
          conv.unreadCount = 0;
        }
      }
    },

    /**
     * Update the typing indicator for a room.
     * Pass userId=null / isTyping=false to remove a user from the list.
     */
    setTyping(
      state,
      action: PayloadAction<{
        roomId: string;
        userId: string;
        isTyping: boolean;
      }>,
    ) {
      const { roomId, userId, isTyping } = action.payload;

      if (!state.typingUsers[roomId]) {
        state.typingUsers[roomId] = [];
      }

      const list = state.typingUsers[roomId];
      const index = list.indexOf(userId);

      if (isTyping && index === -1) {
        list.push(userId);
      } else if (!isTyping && index !== -1) {
        list.splice(index, 1);
      }
    },

    /**
     * Mark a message as read by a given userId.
     */
    markMessageRead(
      state,
      action: PayloadAction<{
        roomId: string;
        messageId: string;
        userId: string;
        readAt?: string;
      }>,
    ) {
      const { roomId, messageId, userId, readAt } = action.payload;
      const messages = state.messages[roomId];
      if (!messages) return;

      const message = messages.find((m) => m._id === messageId);
      if (!message) return;

      const alreadyRead = message.readBy.some((r) => r.userId === userId);
      if (!alreadyRead) {
        message.readBy.push({
          userId,
          readAt: readAt ?? new Date().toISOString(),
        });
      }
    },

    /**
     * Update online status for a 1-to-1 conversation partner.
     */
    setUserOnlineStatus(
      state,
      action: PayloadAction<{ userId: string; isOnline: boolean }>,
    ) {
      const { userId, isOnline } = action.payload;
      const conv = state.conversations.find((c) => c.userId === userId);
      if (conv) {
        conv.isOnline = isOnline;
      }
    },

    /**
     * Remove a message from a room (e.g. after delete).
     */
    removeMessage(
      state,
      action: PayloadAction<{ roomId: string; messageId: string }>,
    ) {
      const { roomId, messageId } = action.payload;
      const messages = state.messages[roomId];
      if (!messages) return;
      const index = messages.findIndex((m) => m._id === messageId);
      if (index !== -1) {
        messages.splice(index, 1);
      }
    },

    /**
     * Clear all chat state (e.g. on logout).
     */
    clearChat(state) {
      state.messages = {};
      state.conversations = [];
      state.activeRoom = null;
      state.typingUsers = {};
      state.hasMoreMessages = {};
      state.messagePage = {};
      state.error = null;
      state.isLoading = false;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },

  extraReducers: (builder) => {
    // ------------------------------------------------------------------
    // fetchConversations
    // ------------------------------------------------------------------
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.isLoading = false;
        state.conversations = action.payload;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to load conversations';
      });

    // ------------------------------------------------------------------
    // fetchPersonalMessages
    // ------------------------------------------------------------------
    builder
      .addCase(fetchPersonalMessages.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPersonalMessages.fulfilled, (state, action) => {
        state.isLoading = false;
        const { roomId, messages, page, totalPages } = action.payload;

        if (page === 1) {
          state.messages[roomId] = messages;
        } else {
          const existing = state.messages[roomId] ?? [];
          state.messages[roomId] = mergeMessages(existing, messages);
        }

        state.messagePage[roomId] = page;
        state.hasMoreMessages[roomId] = page < totalPages;
      })
      .addCase(fetchPersonalMessages.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to load messages';
      });

    // ------------------------------------------------------------------
    // fetchGroupMessages
    // ------------------------------------------------------------------
    builder
      .addCase(fetchGroupMessages.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchGroupMessages.fulfilled, (state, action) => {
        state.isLoading = false;
        const { roomId, messages, page, totalPages } = action.payload;

        if (page === 1) {
          state.messages[roomId] = messages;
        } else {
          const existing = state.messages[roomId] ?? [];
          state.messages[roomId] = mergeMessages(existing, messages);
        }

        state.messagePage[roomId] = page;
        state.hasMoreMessages[roomId] = page < totalPages;
      })
      .addCase(fetchGroupMessages.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to load group messages';
      });
  },
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const {
  addMessage,
  addOptimisticMessage,
  markMessageFailed,
  setActiveRoom,
  setTyping,
  markMessageRead,
  setUserOnlineStatus,
  removeMessage,
  clearChat,
  setError,
} = chatSlice.actions;

export default chatSlice.reducer;
