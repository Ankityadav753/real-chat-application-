import { create } from 'zustand';
import axiosInstance from '../utils/axios';
import toast from 'react-hot-toast';

const pinningConversationIds = new Set();
let currentMessageRequestId = 0;

export const useChatStore = create((set, get) => ({
  conversations: [],
  selectedConversation: null,
  messages: [],
  isConversationsLoading: false,
  isMessagesLoading: false,
  isLoadMoreLoading: false,
  nextCursor: null,
  onlineUsers: [],
  typingUsers: {}, // { conversationId: [usernames] }
  replyingToMessage: null,

  // Set Online Users
  setOnlineUsers: (users) => {
    const safeUsers = Array.isArray(users)
      ? users.map((u) => (u?._id || u || '').toString()).filter(Boolean)
      : [];
    set({ onlineUsers: safeUsers });
  },

  // Set Replying Message
  setReplyingToMessage: (message) => set({ replyingToMessage: message }),

  // Fetch all conversations
  getConversations: async () => {
    set({ isConversationsLoading: true });
    try {
      const res = await axiosInstance.get('/conversations');
      const currentUserId = (localStorage.getItem('userId') || '').toString();
      const activeConvId = (get().selectedConversation?._id || '').toString();

      // Guard: do not let a background/HTTP refresh restore stale unread counts for the active conversation
      const safeConversations = (res.data.conversations || []).map((c) => {
        if (activeConvId && (c._id || '').toString() === activeConvId && currentUserId) {
          const unreadCounts = { ...(c.unreadCounts || {}) };
          unreadCounts[currentUserId] = 0;
          return { ...c, unreadCounts };
        }
        return c;
      });

      set({ conversations: safeConversations, isConversationsLoading: false });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      set({ isConversationsLoading: false });
      toast.error('Failed to load conversations');
    }
  },

  // Set active conversation and load messages
  setSelectedConversation: async (conversation) => {
    // If clearing selection
    if (!conversation) {
      currentMessageRequestId++; // Invalidate any inflight message requests
      set({ selectedConversation: null, messages: [], nextCursor: null });
      return;
    }

    const currentUserId = (localStorage.getItem('userId') || '').toString();
    const targetConvId = (conversation._id || '').toString();

    // 1. Invalidate any previous inflight message requests
    currentMessageRequestId++;

    // 2. Clear unread counts for this conversation deterministically using string ID match
    const updatedConversations = get().conversations.map((c) => {
      if ((c._id || '').toString() === targetConvId) {
        const unreadCounts = { ...(c.unreadCounts || {}) };
        if (currentUserId) {
          unreadCounts[currentUserId] = 0;
        }
        return { ...c, unreadCounts };
      }
      return c;
    });

    set({
      selectedConversation: conversation,
      messages: [],
      nextCursor: null,
      conversations: updatedConversations,
    });

    await get().getMessages(conversation._id);
  },

  // Fetch messages (paginated) with deterministic request/version guard
  getMessages: async (conversationId, isLoadMore = false) => {
    const convIdStr = (conversationId || '').toString();
    if (!convIdStr) return;

    // Guard: Only allow message fetches if this conversation is the actively selected one
    const activeConvId = (get().selectedConversation?._id || '').toString();
    if (activeConvId !== convIdStr) {
      return;
    }

    // Allocate an identifiable request version ID for this fetch
    const requestId = ++currentMessageRequestId;

    const { nextCursor, messages } = get();

    if (isLoadMore) {
      if (!nextCursor) return; // No more messages to load
      set({ isLoadMoreLoading: true });
    } else {
      set({ isMessagesLoading: true });
    }

    try {
      const url = isLoadMore
        ? `/messages/${convIdStr}?limit=30&cursor=${nextCursor}`
        : `/messages/${convIdStr}?limit=30`;

      const res = await axiosInstance.get(url);

      // Deterministic request/version guard:
      // 1. Verify this conversation is still the selected conversation.
      // 2. Verify this is still the latest request (requestId === currentMessageRequestId).
      // If user switched A -> B (or A -> B -> A), stale responses have requestId < currentMessageRequestId
      // and MUST be safely discarded!
      const currentSelectedId = (get().selectedConversation?._id || '').toString();
      if (currentSelectedId !== convIdStr || requestId !== currentMessageRequestId) {
        return; // Stale or out-of-order response discarded
      }

      if (isLoadMore) {
        set({
          messages: [...res.data.messages, ...messages], // Prepend older messages
          nextCursor: res.data.nextCursor,
          isLoadMoreLoading: false,
        });
      } else {
        set({
          messages: res.data.messages,
          nextCursor: res.data.nextCursor,
          isMessagesLoading: false,
        });
      }
    } catch (error) {
      const currentSelectedId = (get().selectedConversation?._id || '').toString();
      if (currentSelectedId === convIdStr && requestId === currentMessageRequestId) {
        console.error('Error fetching messages:', error);
        set({ isMessagesLoading: false, isLoadMoreLoading: false });
        toast.error('Failed to load messages');
      }
    }
  },

  // Send message with Optimistic UI updates
  sendMessage: async (formData) => {
    const { selectedConversation, messages, conversations } = get();
    if (!selectedConversation) return;

    const text = formData.get('text');
    const replyTo = formData.get('replyTo');

    // Create optimistic message with unique tempId
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const optimisticMessage = {
      _id: tempId,
      conversationId: selectedConversation._id,
      senderId: {
        _id: localStorage.getItem('userId') || 'current_user',
        name: 'You',
        username: 'you',
      },
      text: text || '',
      attachments: [], // Cannot display locally easily, will load on success
      replyTo: replyTo ? messages.find((m) => m._id === replyTo) : null,
      seenBy: [localStorage.getItem('userId')],
      deliveredTo: [localStorage.getItem('userId')],
      createdAt: new Date().toISOString(),
      isSending: true, // Custom flag to show loading/pending status
    };

    // Optimistically update message list
    set({ messages: [...messages, optimisticMessage] });

    try {
      const res = await axiosInstance.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const savedMessage = res.data.message;

      // Safe reconciliation (Safeguard 6):
      // Target the exact tempId for this send operation without relying on text comparison
      set((state) => {
        const alreadyHasRealId = state.messages.some((m) => m._id === savedMessage._id);
        if (alreadyHasRealId) {
          // Socket event already added savedMessage by real _id; remove the tempId placeholder
          return {
            messages: state.messages.filter((m) => m._id !== tempId),
          };
        }
        // Replace this exact tempId with the savedMessage
        return {
          messages: state.messages.map((m) => (m._id === tempId ? savedMessage : m)),
        };
      });

      // Update conversations list: update lastMessage and move to top
      const updatedConversations = conversations.map((c) => {
        if (c._id === selectedConversation._id) {
          return { ...c, lastMessage: savedMessage, updatedAt: savedMessage.createdAt };
        }
        return c;
      });
      // Sort conversations so latest active is at the top
      updatedConversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      set({ conversations: updatedConversations });

    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      // Remove the optimistic message on failure
      set((state) => ({
        messages: state.messages.filter((m) => m._id !== tempId),
      }));
    }
  },

  // Edit Message
  editMessage: async (messageId, text) => {
    try {
      const res = await axiosInstance.put(`/messages/${messageId}`, { text });
      const updatedMessage = res.data.message;

      set((state) => ({
        messages: state.messages.map((m) => (m._id === messageId ? updatedMessage : m)),
      }));
      toast.success('Message edited');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to edit message');
    }
  },

  // Delete Message (soft delete)
  deleteMessage: async (messageId) => {
    try {
      await axiosInstance.delete(`/messages/${messageId}`);

      set((state) => ({
        messages: state.messages.map((m) =>
          m._id === messageId
            ? { ...m, text: 'This message was deleted', isDeleted: true, attachments: [] }
            : m
        ),
      }));
      toast.success('Message deleted');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  },

  // React to Message
  reactToMessage: async (messageId, emoji) => {
    try {
      const res = await axiosInstance.put(`/messages/${messageId}/react`, { emoji });
      const { reactions } = res.data;

      set((state) => ({
        messages: state.messages.map((m) =>
          m._id === messageId ? { ...m, reactions } : m
        ),
      }));
    } catch (error) {
      console.error('Reaction error:', error);
    }
  },

  // Toggle Star message
  toggleStarMessage: async (messageId) => {
    try {
      const res = await axiosInstance.put(`/messages/${messageId}/star`);
      const { starredBy } = res.data;

      set((state) => ({
        messages: state.messages.map((m) =>
          m._id === messageId ? { ...m, starredBy } : m
        ),
      }));
      toast.success(res.data.message);
    } catch (error) {
      console.error('Error starring message:', error);
      toast.error('Failed to star message');
    }
  },

  // Toggle Pin Conversation
  togglePinConversation: async (conversationId) => {
    const targetId =
      typeof conversationId === 'object' && conversationId !== null
        ? conversationId._id
        : (conversationId || get().selectedConversation?._id);

    if (!targetId) return;

    if (pinningConversationIds.has(targetId)) return;
    pinningConversationIds.add(targetId);

    try {
      const res = await axiosInstance.put(`/conversations/${targetId}/pin`);
      const { pinnedBy, message } = res.data;

      set((state) => ({
        conversations: state.conversations.map((c) =>
          c._id === targetId ? { ...c, pinnedBy } : c
        ),
        selectedConversation:
          state.selectedConversation?._id === targetId
            ? { ...state.selectedConversation, pinnedBy }
            : state.selectedConversation,
      }));

      if (message) {
        toast.success(message);
      }
      return res.data;
    } catch (error) {
      console.error('Failed to toggle pin conversation:', error);
      const errorMsg =
        error.response?.data?.message || 'Failed to pin/unpin conversation';
      toast.error(errorMsg);
      return null;
    } finally {
      pinningConversationIds.delete(targetId);
    }
  },

  // Create Group
  createGroup: async (formData) => {
    const loadingToast = toast.loading('Creating group...');
    try {
      await axiosInstance.post('/groups', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Group created successfully!', { id: loadingToast });
      get().getConversations();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create group', { id: loadingToast });
      return false;
    }
  },

  // Update Group Settings
  updateGroup: async (groupId, formData) => {
    const loadingToast = toast.loading('Updating group...');
    try {
      const res = await axiosInstance.put(`/groups/${groupId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Group updated successfully!', { id: loadingToast });
      set({ selectedConversation: res.data.group });
      get().getConversations();
      return true;
    } catch (error) {
      console.error('Error updating group settings:', error);
      toast.error('Failed to update group settings', { id: loadingToast });
      return false;
    }
  },

  // Manage Group Members (Add)
  addGroupMembers: async (groupId, memberIds) => {
    const loadingToast = toast.loading('Adding members...');
    try {
      const res = await axiosInstance.put(`/groups/${groupId}/add-members`, { memberIds });
      toast.success('Members added successfully!', { id: loadingToast });
      set({ selectedConversation: res.data.group });
      get().getConversations();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add members', { id: loadingToast });
      return false;
    }
  },

  // Manage Group Members (Remove)
  removeGroupMembers: async (groupId, memberIds) => {
    const loadingToast = toast.loading('Removing members...');
    try {
      const res = await axiosInstance.put(`/groups/${groupId}/remove-members`, { memberIds });
      toast.success('Members removed successfully!', { id: loadingToast });
      set({ selectedConversation: res.data.group });
      get().getConversations();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove members', { id: loadingToast });
      return false;
    }
  },

  // Leave Group
  leaveGroup: async (groupId) => {
    const loadingToast = toast.loading('Leaving group...');
    try {
      await axiosInstance.put(`/groups/${groupId}/leave`);
      toast.success('You left the group', { id: loadingToast });
      set({ selectedConversation: null, messages: [] });
      get().getConversations();
      return true;
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('Failed to leave group', { id: loadingToast });
      return false;
    }
  },

  // Delete Group
  deleteGroup: async (groupId) => {
    const loadingToast = toast.loading('Deleting group...');
    try {
      await axiosInstance.delete(`/groups/${groupId}`);
      toast.success('Group deleted successfully', { id: loadingToast });
      set({ selectedConversation: null, messages: [] });
      get().getConversations();
      return true;
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group', { id: loadingToast });
      return false;
    }
  },

  // --- SOCKET RECEIVERS (REALTIME HANDLERS) ---
  handleNewMessage: (message) => {
    if (!message || !message._id) return;
    const { selectedConversation, conversations } = get();
    const currentUserId = localStorage.getItem('userId');

    // If message belongs to active chat, reconcile with optimistic message or append
    if (selectedConversation && selectedConversation._id === message.conversationId) {
      set((state) => {
        // 1. If message already exists by exact ID, do not duplicate
        if (state.messages.some((m) => m._id === message._id)) {
          return state;
        }

        // 2. If this is sender's own message, reconcile with pending optimistic message
        const senderIdStr = (message.senderId?._id || message.senderId || '').toString();
        const isSelf = senderIdStr === (currentUserId || '').toString();

        if (isSelf) {
          const tempIdx = state.messages.findIndex(
            (m) =>
              (m.isSending || (typeof m._id === 'string' && m._id.startsWith('temp_'))) &&
              m.conversationId === message.conversationId &&
              m.text === (message.text || '') &&
              (m.attachments?.length || 0) === (message.attachments?.length || 0) &&
              Math.abs(new Date(message.createdAt || Date.now()) - new Date(m.createdAt || Date.now())) < 30000
          );
          if (tempIdx !== -1) {
            const updated = [...state.messages];
            updated[tempIdx] = message;
            return { messages: updated };
          }
        }

        return { messages: [...state.messages, message] };
      });
    }

    // Update conversations list (latest message, sorting, unread counts)
    const activeConvId = (selectedConversation?._id || '').toString();
    const msgConvId = (message.conversationId?._id || message.conversationId || '').toString();

    const updatedConversations = conversations.map((c) => {
      const cIdStr = (c._id || '').toString();
      if (cIdStr === msgConvId) {
        // Avoid duplicate unread increment if this conversation was already updated by this exact message (Safeguard 1)
        const currentLastMsgId = (c.lastMessage?._id || c.lastMessage || '').toString();
        if (currentLastMsgId === message._id.toString()) {
          return c;
        }

        let unreadCounts = { ...(c.unreadCounts || {}) };

        // Increment unread count only if user is NOT currently in this chat
        const isCurrentlyOpen = activeConvId && activeConvId === msgConvId;
        const senderIdStr = (message.senderId?._id || message.senderId || '').toString();
        const isFromOther = senderIdStr !== currentUserId;

        if (!isCurrentlyOpen && isFromOther) {
          unreadCounts[currentUserId] = (unreadCounts[currentUserId] || 0) + 1;
        } else if (isCurrentlyOpen && currentUserId) {
          unreadCounts[currentUserId] = 0;
        }

        return {
          ...c,
          lastMessage: message,
          unreadCounts,
          updatedAt: message.createdAt || new Date().toISOString(),
        };
      }
      return c;
    });

    updatedConversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    set({ conversations: updatedConversations });
  },

  handleMessageEdited: (editedMessage) => {
    const { selectedConversation, messages } = get();
    if (selectedConversation && selectedConversation._id === editedMessage.conversationId) {
      set({
        messages: messages.map((m) => (m._id === editedMessage._id ? editedMessage : m)),
      });
    }
  },

  handleMessageDeleted: ({ messageId, conversationId }) => {
    const { selectedConversation, messages } = get();
    if (selectedConversation && selectedConversation._id === conversationId) {
      set({
        messages: messages.map((m) =>
          m._id === messageId
            ? { ...m, text: 'This message was deleted', isDeleted: true, attachments: [] }
            : m
        ),
      });
    }
  },

  handleMessageReaction: ({ messageId, conversationId, reactions }) => {
    const { selectedConversation, messages } = get();
    if (selectedConversation && selectedConversation._id === conversationId) {
      set({
        messages: messages.map((m) => (m._id === messageId ? { ...m, reactions } : m)),
      });
    }
  },

  handleSeenUpdate: ({ conversationId, userId }) => {
    const { selectedConversation, messages } = get();
    if (selectedConversation && selectedConversation._id === conversationId) {
      const uIdStr = (userId?._id || userId || '').toString();
      // Mark all messages from others as seen by this user
      set({
        messages: messages.map((m) => {
          const senderIdStr = (m.senderId?._id || m.senderId || '').toString();
          const seenByArray = m.seenBy || [];
          const alreadySeen = seenByArray.some(
            (id) => (id?._id || id || '').toString() === uIdStr
          );

          if (senderIdStr !== uIdStr && !alreadySeen) {
            return { ...m, seenBy: [...seenByArray, uIdStr] };
          }
          return m;
        }),
      });
    }
  },

  handleMessageDelivered: ({ messageId, deliveredBy, conversationId: _conversationId }) => {
    if (!messageId) return;
    const msgIdStr = messageId.toString();
    const deliveredByStr = (deliveredBy?._id || deliveredBy || '').toString();

    set((state) => {
      // 1. Update matching message in active messages list
      const updatedMessages = state.messages.map((m) => {
        if (m._id && m._id.toString() === msgIdStr) {
          const currentDeliveredTo = m.deliveredTo || [];
          const alreadyDelivered = currentDeliveredTo.some(
            (id) => (id?._id || id || '').toString() === deliveredByStr
          );

          if (!alreadyDelivered && deliveredByStr) {
            return {
              ...m,
              deliveredTo: [...currentDeliveredTo, deliveredByStr],
            };
          }
        }
        return m;
      });

      // 2. Update lastMessage in conversations list if matching
      const updatedConversations = state.conversations.map((c) => {
        if (
          c.lastMessage &&
          c.lastMessage._id &&
          c.lastMessage._id.toString() === msgIdStr
        ) {
          const currentDeliveredTo = c.lastMessage.deliveredTo || [];
          const alreadyDelivered = currentDeliveredTo.some(
            (id) => (id?._id || id || '').toString() === deliveredByStr
          );

          if (!alreadyDelivered && deliveredByStr) {
            return {
              ...c,
              lastMessage: {
                ...c.lastMessage,
                deliveredTo: [...currentDeliveredTo, deliveredByStr],
              },
            };
          }
        }
        return c;
      });

      return {
        messages: updatedMessages,
        conversations: updatedConversations,
      };
    });
  },

  handleUserOnlineStatus: (userId, isOnline, lastSeen) => {
    const userIdStr = (userId?._id || userId || '').toString();
    if (!userIdStr) return;

    const currentLastSeen = lastSeen || new Date();

    set((state) => {
      // 1. Synchronize onlineUsers array
      const currentOnline = state.onlineUsers || [];
      const alreadyInList = currentOnline.some(
        (id) => (id?._id || id || '').toString() === userIdStr
      );

      let updatedOnlineUsers;
      if (isOnline) {
        updatedOnlineUsers = alreadyInList ? currentOnline : [...currentOnline, userIdStr];
      } else {
        updatedOnlineUsers = currentOnline.filter(
          (id) => (id?._id || id || '').toString() !== userIdStr
        );
      }

      // 2. Update participants in conversations list
      const updatedConversations = state.conversations.map((c) => {
        if (!c.isGroup && Array.isArray(c.participants)) {
          const participants = c.participants.map((p) => {
            const pIdStr = (p?._id || p || '').toString();
            if (pIdStr === userIdStr) {
              return {
                ...p,
                onlineStatus: isOnline,
                lastSeen: currentLastSeen,
              };
            }
            return p;
          });
          return { ...c, participants };
        }
        return c;
      });

      // 3. Update participants in selectedConversation if currently active
      let updatedSelectedConversation = state.selectedConversation;
      if (
        state.selectedConversation &&
        !state.selectedConversation.isGroup &&
        Array.isArray(state.selectedConversation.participants)
      ) {
        const hasParticipant = state.selectedConversation.participants.some(
          (p) => (p?._id || p || '').toString() === userIdStr
        );
        if (hasParticipant) {
          updatedSelectedConversation = {
            ...state.selectedConversation,
            participants: state.selectedConversation.participants.map((p) => {
              const pIdStr = (p?._id || p || '').toString();
              if (pIdStr === userIdStr) {
                return {
                  ...p,
                  onlineStatus: isOnline,
                  lastSeen: currentLastSeen,
                };
              }
              return p;
            }),
          };
        }
      }

      return {
        onlineUsers: updatedOnlineUsers,
        conversations: updatedConversations,
        selectedConversation: updatedSelectedConversation,
      };
    });
  },

  handleTypingStatus: (conversationId, username, isTyping) => {
    set((state) => {
      const currentList = state.typingUsers[conversationId] || [];
      let newList;

      if (isTyping) {
        newList = Array.from(new Set([...currentList, username]));
      } else {
        newList = currentList.filter((name) => name !== username);
      }

      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: newList,
        },
      };
    });
  },

  handleGroupUpdated: (data) => {
    if (!data || !data.conversationId) return;
    const { selectedConversation, conversations } = get();
    const convIdStr = data.conversationId.toString();

    // If the active conversation is this group, update its metadata
    if (selectedConversation && selectedConversation._id && selectedConversation._id.toString() === convIdStr) {
      const currentUserId = (localStorage.getItem('userId') || '').toString();
      // If current user was removed, close conversation view
      if (Array.isArray(data.removedMemberIds) && data.removedMemberIds.includes(currentUserId)) {
        set({ selectedConversation: null, messages: [] });
      } else {
        set({
          selectedConversation: {
            ...selectedConversation,
            ...(data.groupName !== undefined && { groupName: data.groupName }),
            ...(data.groupAvatar !== undefined && { groupAvatar: data.groupAvatar }),
            ...(data.groupAdmin !== undefined && { groupAdmin: data.groupAdmin }),
            ...(data.participants !== undefined && { participants: data.participants }),
          },
        });
      }
    }

    // Update conversation in sidebar list
    const updatedConversations = conversations.map((c) => {
      if (c._id && c._id.toString() === convIdStr) {
        return {
          ...c,
          ...(data.groupName !== undefined && { groupName: data.groupName }),
          ...(data.groupAvatar !== undefined && { groupAvatar: data.groupAvatar }),
          ...(data.groupAdmin !== undefined && { groupAdmin: data.groupAdmin }),
          ...(data.participants !== undefined && { participants: data.participants }),
        };
      }
      return c;
    });

    set({ conversations: updatedConversations });
  },

  handleGroupDeleted: ({ conversationId } = {}) => {
    if (!conversationId) return;
    const { selectedConversation, conversations } = get();
    const convIdStr = conversationId.toString();

    if (selectedConversation && selectedConversation._id && selectedConversation._id.toString() === convIdStr) {
      set({ selectedConversation: null, messages: [] });
    }

    set({
      conversations: conversations.filter((c) => c._id && c._id.toString() !== convIdStr),
    });
  },
}));

