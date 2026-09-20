import { Server } from 'socket.io';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import { socketCorsOptions } from '../config/cors.js';
import { getJwtSecret } from '../utils/token.js';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: socketCorsOptions,
});

// Maps userId to Set of socket IDs: { [userId: string]: Set<string> }
const userSocketMap = {};

export const getReceiverSocketId = (userId) => {
  const sockets = userSocketMap[userId];
  if (!sockets || sockets.size === 0) return null;
  const arr = Array.from(sockets);
  return arr.length === 1 ? arr[0] : arr;
};

export const getReceiverSocketIds = (userId) => {
  const sockets = userSocketMap[userId];
  return sockets ? Array.from(sockets) : [];
};

export const getOnlineUserIds = () => {
  return Object.keys(userSocketMap).filter(
    (id) => userSocketMap[id] && userSocketMap[id].size > 0
  );
};

// Middleware to authenticate Socket.io connection
io.use(async (socket, next) => {
  try {
    let token = socket.handshake.auth?.token;

    // Check cookies if token is not in auth object
    if (!token && socket.handshake.headers.cookie) {
      const cookieStr = socket.handshake.headers.cookie;
      const match = cookieStr.match(/(^|;\s*)accessToken=([^;]*)/);
      if (match) {
        token = decodeURIComponent(match[2]);
      }
    }

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('Authentication error: Token expired'));
    }
    console.error('Socket authentication error:', err.message);
    next(new Error('Authentication error: Invalid token'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.user._id.toString();

  if (!userSocketMap[userId]) {
    userSocketMap[userId] = new Set();
  }

  const wasAlreadyOnline = userSocketMap[userId].size > 0;
  userSocketMap[userId].add(socket.id);

  console.log(`User connected: ${socket.user.username} (Socket: ${socket.id}, active sockets: ${userSocketMap[userId].size})`);

  // Update online status in database and broadcast only on first active socket
  if (!wasAlreadyOnline) {
    try {
      await User.findByIdAndUpdate(userId, { onlineStatus: true });
      io.emit('user-online', { userId });
    } catch (err) {
      console.error('Error updating user onlineStatus:', err.message);
    }
  }

  // Send current list of online users to the newly connected user
  socket.emit('online-users', getOnlineUserIds());

  // Join a private room for the user to receive direct targeted events
  socket.join(`user:${userId}`);

  // Handle request for current online users (Requirement 3)
  socket.on('get-online-users', (callback) => {
    const onlineIds = getOnlineUserIds();
    socket.emit('online-users', onlineIds);
    if (typeof callback === 'function') {
      callback(onlineIds);
    }
  });

  // Join conversation-specific rooms
  socket.on('join-chat', async (conversationId) => {
    try {
      if (
        !conversationId ||
        typeof conversationId !== 'string' ||
        !/^[0-9a-fA-F]{24}$/.test(conversationId.trim())
      ) {
        return;
      }

      const cleanConvId = conversationId.trim();
      const conversation = await Conversation.findById(cleanConvId);
      if (!conversation) {
        return;
      }

      const socketUserIdStr = String(socket.user?._id || '');
      const isParticipant = conversation.participants?.some(
        (p) => String(p?._id || p) === socketUserIdStr
      );

      if (!isParticipant) {
        return;
      }

      socket.join(`conversation:${cleanConvId}`);
      console.log(`Socket ${socket.id} joined conversation:${cleanConvId}`);
    } catch (err) {
      console.error('Error in join-chat socket handler:', err.message);
    }
  });

  socket.on('leave-chat', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
    console.log(`Socket ${socket.id} left conversation:${conversationId}`);
  });

  // Typing indicators
  socket.on('typing', ({ conversationId, username }) => {
    socket.to(`conversation:${conversationId}`).emit('typing', { conversationId, username });
  });

  socket.on('stop-typing', ({ conversationId, username }) => {
    socket.to(`conversation:${conversationId}`).emit('stop-typing', { conversationId, username });
  });

  // Mark messages in conversation as seen
  socket.on('message-seen', async (payload) => {
    try {
      if (!payload || typeof payload !== 'object') return;
      const { conversationId, messageId } = payload;

      if (
        !conversationId ||
        typeof conversationId !== 'string' ||
        !/^[0-9a-fA-F]{24}$/.test(conversationId.trim())
      ) {
        return;
      }

      const cleanConvId = conversationId.trim();
      const conversation = await Conversation.findById(cleanConvId);
      if (!conversation) return;

      const socketUserIdStr = String(socket.user?._id || '');
      if (!socketUserIdStr) return;

      const isParticipant = conversation.participants?.some(
        (participant) => String(participant?._id || participant) === socketUserIdStr
      );
      if (!isParticipant) {
        return;
      }

      // If specific messageId is provided, validate and mark that message
      let cleanMsgId = null;
      if (messageId !== undefined && messageId !== null) {
        if (
          typeof messageId !== 'string' ||
          !/^[0-9a-fA-F]{24}$/.test(messageId.trim())
        ) {
          return;
        }
        cleanMsgId = messageId.trim();
        const targetMessage = await Message.findById(cleanMsgId);
        if (!targetMessage) return;

        // Verify target message belongs to supplied conversationId
        if (String(targetMessage.conversationId?._id || targetMessage.conversationId) !== cleanConvId) {
          return;
        }

        // Verify authenticated user is not the message sender
        const senderIdStr = String(targetMessage.senderId?._id || targetMessage.senderId || '');
        if (senderIdStr === socketUserIdStr) {
          return;
        }

        await Message.findByIdAndUpdate(cleanMsgId, {
          $addToSet: { seenBy: socket.user._id, deliveredTo: socket.user._id },
        });
      } else {
        // Conversation-wide seen: find all messages in conversation where sender is not current user and seenBy does not contain current user
        await Message.updateMany(
          {
            conversationId: cleanConvId,
            senderId: { $ne: socket.user._id },
            seenBy: { $ne: socket.user._id },
          },
          {
            $addToSet: { seenBy: socket.user._id, deliveredTo: socket.user._id },
          }
        );
      }

      // Reset unread count for current user
      if (conversation.unreadCounts && typeof conversation.unreadCounts.set === 'function') {
        conversation.unreadCounts.set(socketUserIdStr, 0);
        await conversation.save();
      }

      // Emit read status update to room
      io.to(`conversation:${cleanConvId}`).emit('messages-seen-update', {
        conversationId: cleanConvId,
        userId: socketUserIdStr,
        ...(cleanMsgId ? { messageId: cleanMsgId } : {}),
      });
    } catch (err) {
      console.error('Error in message-seen socket handler:', err.message);
    }
  });

  // Message delivered acknowledgment handler
  socket.on('message-delivered', async (payload) => {
    try {
      const messageId = payload?.messageId;
      if (
        !messageId ||
        typeof messageId !== 'string' ||
        !/^[a-fA-F0-9]{24}$/.test(messageId.trim())
      ) {
        return;
      }

      const msgId = messageId.trim();
      const message = await Message.findById(msgId);
      if (!message) return;

      const recipientId = socket.user._id;
      const recipientIdStr = (recipientId?._id || recipientId || '').toString();
      const senderIdStr = (message.senderId?._id || message.senderId || '').toString();

      // Recipient cannot be the sender acknowledging delivery to themselves
      if (recipientIdStr === senderIdStr) return;

      // Verify authenticated user is a participant in the conversation
      const conversation = await Conversation.findById(message.conversationId);
      if (!conversation) return;

      const isParticipant = conversation.participants.some(
        (p) => (p?._id || p || '').toString() === recipientIdStr
      );
      if (!isParticipant) return;

      // Idempotently add authenticated recipient to deliveredTo using $addToSet
      await Message.findByIdAndUpdate(msgId, {
        $addToSet: { deliveredTo: recipientId },
      });

      // Notify sender across all of sender's active sockets (multi-socket support from Step 5)
      const senderSocketIds = getReceiverSocketIds(senderIdStr);
      if (senderSocketIds && senderSocketIds.length > 0) {
        io.to(senderSocketIds).emit('message-delivered', {
          messageId: msgId,
          conversationId: message.conversationId.toString(),
          deliveredBy: recipientIdStr,
        });
      }
    } catch (err) {
      console.error('Error in message-delivered socket handler:', err.message);
    }
  });

  // Disconnection handler
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.user.username} (Socket: ${socket.id})`);

    if (userSocketMap[userId]) {
      userSocketMap[userId].delete(socket.id);
      if (userSocketMap[userId].size === 0) {
        delete userSocketMap[userId];
      }
    }

    const isStillOnline = Boolean(userSocketMap[userId] && userSocketMap[userId].size > 0);

    // Only mark user offline if no active sockets remain for this user
    if (!isStillOnline) {
      const now = new Date();

      // Broadcast list of online users
      io.emit('online-users', getOnlineUserIds());

      try {
        await User.findByIdAndUpdate(userId, {
          onlineStatus: false,
          lastSeen: now,
        });
        io.emit('user-offline', { userId, lastSeen: now });
      } catch (err) {
        console.error('Error updating user offlineStatus:', err.message);
      }
    }
  });
});

export { app, server, io };
