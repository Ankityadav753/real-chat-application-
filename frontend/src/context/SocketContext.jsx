import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';

const SocketContext = createContext(null);

export const useSocket = () => {
  return useContext(SocketContext);
};

// Helper: Room ID safety validation (Safeguard 5)
const isValidConversationId = (id) => {
  return typeof id === 'string' && id.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(id.trim());
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { user, isAuthenticated } = useAuthStore();
  const {
    setOnlineUsers,
    handleNewMessage,
    handleMessageEdited,
    handleMessageDeleted,
    handleMessageReaction,
    handleSeenUpdate,
    handleMessageDelivered,
    handleUserOnlineStatus,
    handleTypingStatus,
    handleGroupUpdated,
    handleGroupDeleted,
  } = useChatStore();

  const selectedConversation = useChatStore((state) => state.selectedConversation);
  const selectedConversationId = selectedConversation?._id;
  const prevConversationIdRef = useRef(null);
  const lastChimedMessageIdRef = useRef(null);
  const acknowledgedDeliveryIdsRef = useRef(new Set());
  const refreshAttemptsRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const MAX_REFRESH_ATTEMPTS = 3;

  // Initialize and manage Socket connection lifecycle (Safeguard 2, 3, 4, Step 2)
  useEffect(() => {
    let socketInstance = null;

    if (isAuthenticated && user) {
      // Save user ID to localStorage for optimistic updates
      localStorage.setItem('userId', user._id);

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL
        ? import.meta.env.VITE_BACKEND_URL.replace('/api', '')
        : 'http://localhost:5000';

      socketInstance = io(BACKEND_URL, {
        withCredentials: true, // Crucial for HTTP Only cookie transmission
        transports: ['websocket', 'polling'],
      });

      setSocket(socketInstance);

      // Reconnect Safety (Safeguard 4): Rejoin ONLY the currently selected conversation
      const onConnect = () => {
        // Reset auth refresh retry attempts upon successful connection
        refreshAttemptsRef.current = 0;

        const activeChatId = useChatStore.getState().selectedConversation?._id;
        if (isValidConversationId(activeChatId)) {
          socketInstance.emit('join-chat', activeChatId.trim());
          prevConversationIdRef.current = activeChatId.trim();
        }

        // Request fresh online users list upon connect/reconnect
        socketInstance.emit('get-online-users');
      };

      // Handle connection and auth errors gracefully (Step 2)
      const onConnectError = async (error) => {
        const errorMsg = error?.message || '';

        // Distinguish auth error vs network error (Requirement 12)
        const isAuthError =
          errorMsg.includes('Authentication error') ||
          errorMsg.includes('Token expired') ||
          errorMsg.includes('jwt expired') ||
          errorMsg.includes('Token missing') ||
          errorMsg.includes('Invalid token');

        if (!isAuthError) {
          // Non-auth error (e.g. temporary network drop, server restarting)
          // Let Socket.io built-in reconnection retry without logging out
          return;
        }

        // Prevent concurrent refresh calls from duplicate error events (Safeguard 6 & 10)
        if (isRefreshingRef.current) {
          return;
        }

        // Bounded retry behavior: prevent infinite loops (Safeguard 6)
        if (refreshAttemptsRef.current >= MAX_REFRESH_ATTEMPTS) {
          console.warn('Socket token refresh limit reached. Terminating session.');
          if (socketInstance) {
            socketInstance.disconnect();
          }
          useAuthStore.getState().logout();
          return;
        }

        isRefreshingRef.current = true;
        refreshAttemptsRef.current += 1;

        try {
          // Call existing refresh-token flow via useAuthStore
          const refreshResult = await useAuthStore.getState().refreshToken();

          if (refreshResult?.success) {
            // Token refreshed and fresh cookie set! Reconnect existing socket (Safeguards 5c, 7)
            setTimeout(() => {
              if (socketInstance && !socketInstance.connected) {
                socketInstance.connect();
              }
            }, 300);
          } else {
            // Refresh token invalid or expired; cleanly log out (Safeguard 5d)
            if (socketInstance) {
              socketInstance.disconnect();
            }
            useAuthStore.getState().logout();
          }
        } catch (err) {
          if (socketInstance) {
            socketInstance.disconnect();
          }
          useAuthStore.getState().logout();
        } finally {
          isRefreshingRef.current = false;
        }
      };

      // Named listeners for exact cleanup (Safeguard 2)
      const onOnlineUsers = (users) => {
        setOnlineUsers(users);
      };

      const onUserOnline = ({ userId }) => {
        handleUserOnlineStatus(userId, true);
      };

      const onUserOffline = ({ userId, lastSeen }) => {
        handleUserOnlineStatus(userId, false, lastSeen);
      };

      const onNewMessage = (message) => {
        handleNewMessage(message);

        // Acknowledge delivery idempotently if received from another user
        if (message && message._id && !message.isSending) {
          const currentUid = (user?._id || localStorage.getItem('userId') || '').toString();
          const senderUid = (message.senderId?._id || message.senderId || '').toString();
          const msgId = message._id.toString();

          if (senderUid && senderUid !== currentUid && !msgId.startsWith('temp_')) {
            if (!acknowledgedDeliveryIdsRef.current.has(msgId)) {
              acknowledgedDeliveryIdsRef.current.add(msgId);
              socketInstance.emit('message-delivered', { messageId: msgId });
            }
          }
        }

        // If this message belongs to the current open chat, notify server that it's seen
        const activeChat = useChatStore.getState().selectedConversation;
        if (activeChat && activeChat._id === message?.conversationId) {
          const currentUid = (user?._id || localStorage.getItem('userId') || '').toString();
          const senderUid = (message.senderId?._id || message.senderId || '').toString();
          if (senderUid !== currentUid && isValidConversationId(activeChat._id)) {
            socketInstance.emit('message-seen', { conversationId: activeChat._id });
          }
        }
      };

      const onMessageNotification = ({ conversationId, message }) => {
        if (!message || !message._id) return;

        // Message-notification idempotency (Safeguard 1):
        // Only chime once per unique message _id
        if (lastChimedMessageIdRef.current !== message._id) {
          lastChimedMessageIdRef.current = message._id;
          try {
            const audio = new Audio('/ting.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch (e) {
            // Audio play blocked or not found
          }
        }

        // Pass to store: handleNewMessage uses message._id as idempotency key
        handleNewMessage(message);

        // Acknowledge delivery idempotently if received from another user
        const currentUid = (user?._id || localStorage.getItem('userId') || '').toString();
        const senderUid = (message.senderId?._id || message.senderId || '').toString();
        const msgId = message._id.toString();

        if (senderUid && senderUid !== currentUid && !msgId.startsWith('temp_')) {
          if (!acknowledgedDeliveryIdsRef.current.has(msgId)) {
            acknowledgedDeliveryIdsRef.current.add(msgId);
            socketInstance.emit('message-delivered', { messageId: msgId });
          }
        }
      };

      const onMessageDelivered = ({ messageId, deliveredBy, conversationId }) => {
        handleMessageDelivered({ messageId, deliveredBy, conversationId });
      };

      const onMessageEdited = (editedMessage) => {
        handleMessageEdited(editedMessage);
      };

      const onMessageDeleted = (payload) => {
        handleMessageDeleted(payload);
      };

      const onMessageReaction = (payload) => {
        handleMessageReaction(payload);
      };

      const onMessagesSeenUpdate = (payload) => {
        handleSeenUpdate(payload);
      };

      const onTyping = ({ conversationId, username }) => {
        handleTypingStatus(conversationId, username, true);
      };

      const onStopTyping = ({ conversationId, username }) => {
        handleTypingStatus(conversationId, username, false);
      };

      const onGroupUpdated = (payload) => {
        handleGroupUpdated(payload);
      };

      const onGroupDeleted = (payload) => {
        handleGroupDeleted(payload);
      };

      // Register named listeners
      socketInstance.on('connect', onConnect);
      socketInstance.on('connect_error', onConnectError);
      socketInstance.on('online-users', onOnlineUsers);
      socketInstance.on('user-online', onUserOnline);
      socketInstance.on('user-offline', onUserOffline);
      socketInstance.on('new-message', onNewMessage);
      socketInstance.on('message-notification', onMessageNotification);
      socketInstance.on('message-edited', onMessageEdited);
      socketInstance.on('message-deleted', onMessageDeleted);
      socketInstance.on('message-reaction', onMessageReaction);
      socketInstance.on('messages-seen-update', onMessagesSeenUpdate);
      socketInstance.on('message-delivered', onMessageDelivered);
      socketInstance.on('typing', onTyping);
      socketInstance.on('stop-typing', onStopTyping);
      socketInstance.on('group-updated', onGroupUpdated);
      socketInstance.on('group-deleted', onGroupDeleted);

      // Listener cleanup (Safeguard 2): Exact event name and exact handler references
      return () => {
        socketInstance.off('connect', onConnect);
        socketInstance.off('connect_error', onConnectError);
        socketInstance.off('online-users', onOnlineUsers);
        socketInstance.off('user-online', onUserOnline);
        socketInstance.off('user-offline', onUserOffline);
        socketInstance.off('new-message', onNewMessage);
        socketInstance.off('message-notification', onMessageNotification);
        socketInstance.off('message-edited', onMessageEdited);
        socketInstance.off('message-deleted', onMessageDeleted);
        socketInstance.off('message-reaction', onMessageReaction);
        socketInstance.off('messages-seen-update', onMessagesSeenUpdate);
        socketInstance.off('message-delivered', onMessageDelivered);
        socketInstance.off('typing', onTyping);
        socketInstance.off('stop-typing', onStopTyping);
        socketInstance.off('group-updated', onGroupUpdated);
        socketInstance.off('group-deleted', onGroupDeleted);

        // Only disconnect when SocketContext itself is actually unmounting/logging out (Safeguard 3)
        socketInstance.disconnect();
      };
    } else {
      // Disconnect socket if user logs out
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      localStorage.removeItem('userId');
    }
  }, [isAuthenticated, user?._id]);

  // Manage conversation room joining and leaving (Safeguard 3 & 5)
  // Socket connection stays ALIVE; only rooms change
  useEffect(() => {
    if (!socket || !isValidConversationId(selectedConversationId)) {
      return;
    }

    const chatId = selectedConversationId.trim();
    socket.emit('join-chat', chatId);
    prevConversationIdRef.current = chatId;

    return () => {
      if (isValidConversationId(chatId) && socket) {
        socket.emit('leave-chat', chatId);
      }
      if (prevConversationIdRef.current === chatId) {
        prevConversationIdRef.current = null;
      }
    };
  }, [socket, selectedConversationId]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

