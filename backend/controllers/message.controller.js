import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryPublicId } from '../utils/cloudinaryUpload.js';
import { io, getReceiverSocketId } from '../socket/socket.js';

// Get messages for a conversation (paginated using cursor for infinite scroll)
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 30, cursor } = req.query; // cursor is a message timestamp

    if (!conversationId || !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const currentUserIdStr = String(req.user?._id || req.user || '');
    const isParticipant = conversation.participants?.some(
      (participant) => String(participant?._id || participant) === currentUserIdStr
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a participant in this conversation',
      });
    }

    const query = { conversationId };

    // If cursor is provided, fetch messages older than the cursor (createdAt < cursor)
    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const messages = await Message.find(query)
      .populate('senderId', 'name username profilePic onlineStatus')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'senderId',
          select: 'name username',
        },
      })
      .sort({ createdAt: -1 }) // Get latest messages first
      .limit(parseInt(limit));

    // Calculate if there are more messages
    let nextCursor = null;
    if (messages.length === parseInt(limit)) {
      nextCursor = messages[messages.length - 1].createdAt;
    }

    // Return messages in reverse order so the client gets them chronologically
    res.status(200).json({
      success: true,
      messages: messages.reverse(),
      nextCursor,
    });
  } catch (error) {
    console.error('getMessages error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching messages' });
  }
};

// Send message
export const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { text, conversationId, replyTo } = req.body;

    if (!conversationId || !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return res.status(400).json({ success: false, message: 'Valid Conversation ID is required' });
    }

    // 1. Authorize conversation participation BEFORE any Cloudinary upload
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const senderIdStr = (senderId?._id || senderId || '').toString();
    const isParticipant = conversation.participants.some(
      (p) => (p?._id || p || '').toString() === senderIdStr
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Access denied: You are not a participant in this conversation' });
    }

    // 2. Validate message content (must have text or attachments)
    const hasText = Boolean(text && text.trim());
    const hasFiles = Boolean(req.files && req.files.length > 0);

    if (!hasText && !hasFiles) {
      return res.status(400).json({ success: false, message: 'Message content or attachment is required' });
    }

    // 3. Process attachments only after authorization passes
    const attachments = [];
    if (hasFiles) {
      const uploadResults = await Promise.allSettled(
        req.files.map((file) =>
          uploadToCloudinary(file.buffer, file.mimetype, file.originalname)
        )
      );

      const successfulUploads = [];
      let firstError = null;

      for (const resItem of uploadResults) {
        if (resItem.status === 'fulfilled') {
          successfulUploads.push(resItem.value);
        } else if (!firstError) {
          firstError = resItem.reason;
        }
      }

      if (firstError) {
        // Clean up any files that did upload before the failure
        if (successfulUploads.length > 0) {
          try {
            await Promise.allSettled(
              successfulUploads.map((att) =>
                att?.publicId ? deleteFromCloudinary(att.publicId, att.type) : Promise.resolve()
              )
            );
          } catch (cleanupErr) {
            console.error('Cleanup of partial uploads failed:', cleanupErr.message || cleanupErr);
          }
        }

        console.error('Attachment upload failed:', firstError.message || firstError);
        const statusCode = firstError.code === 'CLOUDINARY_NOT_CONFIGURED' ? 503 : 500;
        return res.status(statusCode).json({
          success: false,
          message: firstError.code === 'CLOUDINARY_NOT_CONFIGURED'
            ? 'Media upload service is not configured on this server'
            : 'Failed to upload attachments',
        });
      }

      attachments.push(...successfulUploads);
    }

    // 4. Create and persist message
    const message = new Message({
      conversationId,
      senderId,
      text: text || '',
      attachments,
      replyTo: replyTo || null,
      seenBy: [senderId],
      deliveredTo: [senderId],
    });

    try {
      await message.save();

      // Populate message details
      const populatedMessage = await Message.findById(message._id)
        .populate('senderId', 'name username profilePic onlineStatus')
        .populate({
          path: 'replyTo',
          populate: {
            path: 'senderId',
            select: 'name username',
          },
        });

      // Update conversation lastMessage and handle unread counts
      conversation.lastMessage = message._id;
      // Increment unread counts for all participants except sender
      conversation.participants.forEach((participant) => {
        const pIdStr = (participant?._id || participant || '').toString();
        if (pIdStr && pIdStr !== senderIdStr) {
          const currentCount = conversation.unreadCounts.get(pIdStr) || 0;
          conversation.unreadCounts.set(pIdStr, currentCount + 1);
        }
      });
      await conversation.save();

      // --- SOCKET.IO REALTIME BROADCAST ---
      // 1. Broadcast to active chat room
      io.to(`conversation:${conversationId}`).emit('new-message', populatedMessage);

      // 2. Notify other participants individually (useful if they are online but on a different screen/chat)
      if (conversation) {
        conversation.participants.forEach((participant) => {
          const pIdStr = (participant?._id || participant || '').toString();
          if (pIdStr && pIdStr !== senderIdStr) {
            const socketId = getReceiverSocketId(pIdStr);
            if (socketId) {
              // Send new message alert for sidebar updating and badge incrementing
              io.to(socketId).emit('message-notification', {
                conversationId,
                message: populatedMessage,
              });
            }
          }
        });
      }

      res.status(201).json({
        success: true,
        message: populatedMessage,
      });
    } catch (saveError) {
      // Clean up newly uploaded Cloudinary attachments if MongoDB save/populate/update fails
      if (attachments.length > 0) {
        try {
          await Promise.allSettled(
            attachments.map((att) =>
              att?.publicId ? deleteFromCloudinary(att.publicId, att.type) : Promise.resolve()
            )
          );
        } catch (cleanupErr) {
          console.error('Orphan attachment cleanup failed:', cleanupErr.message || cleanupErr);
        }
      }
      console.error('sendMessage save error:', saveError.message || saveError);
      return res.status(500).json({ success: false, message: 'Server error sending message' });
    }
  } catch (error) {
    console.error('sendMessage error:', error.message);
    res.status(500).json({ success: false, message: 'Server error sending message' });
  }
};

// Edit message
export const editMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Edited text content is required' });
    }

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const senderIdStr = (message.senderId?._id || message.senderId || '').toString();
    const currentUserIdStr = (userId?._id || userId || '').toString();
    if (senderIdStr !== currentUserIdStr) {
      return res.status(403).json({ success: false, message: 'Unauthorized to edit this message' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ success: false, message: 'Cannot edit a deleted message' });
    }

    message.text = text;
    message.isEdited = true;
    await message.save();

    const populated = await Message.findById(id)
      .populate('senderId', 'name username profilePic')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'senderId',
          select: 'name username',
        },
      });

    // Broadcast edit event
    io.to(`conversation:${message.conversationId}`).emit('message-edited', populated);

    res.status(200).json({ success: true, message: populated });
  } catch (error) {
    console.error('editMessage error:', error.message);
    res.status(500).json({ success: false, message: 'Server error editing message' });
  }
};

// Soft delete message
export const deleteMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const senderIdStr = (message.senderId?._id || message.senderId || '').toString();
    const currentUserIdStr = (userId?._id || userId || '').toString();
    if (senderIdStr !== currentUserIdStr) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this message' });
    }

    // Best-effort cleanup of Cloudinary assets before clearing attachments
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      try {
        await Promise.allSettled(
          message.attachments.map(async (att) => {
            const publicId = extractCloudinaryPublicId(att);
            if (publicId) {
              await deleteFromCloudinary(publicId, att.type || 'file');
            }
          })
        );
      } catch (cleanupErr) {
        console.error('Best-effort Cloudinary cleanup error on message delete:', cleanupErr.message || cleanupErr);
      }
    }

    message.text = 'This message was deleted';
    message.isDeleted = true;
    message.attachments = []; // Clear attachments
    await message.save();

    // Broadcast delete event
    io.to(`conversation:${message.conversationId}`).emit('message-deleted', {
      messageId: id,
      conversationId: message.conversationId,
    });

    res.status(200).json({
      success: true,
      messageId: id,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    console.error('deleteMessage error:', error.message);
    res.status(500).json({ success: false, message: 'Server error deleting message' });
  }
};

// React to a message
export const reactToMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ success: false, message: 'Emoji reaction is required' });
    }

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingReactionIndex > -1) {
      if (message.reactions[existingReactionIndex].emoji === emoji) {
        // Toggle off if same emoji
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Change emoji
        message.reactions[existingReactionIndex].emoji = emoji;
      }
    } else {
      // Add reaction
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    // Broadcast reaction event
    io.to(`conversation:${message.conversationId}`).emit('message-reaction', {
      messageId: id,
      conversationId: message.conversationId,
      reactions: message.reactions,
    });

    res.status(200).json({
      success: true,
      reactions: message.reactions,
      messageId: id,
    });
  } catch (error) {
    console.error('reactToMessage error:', error.message);
    res.status(500).json({ success: false, message: 'Server error adding reaction' });
  }
};

// Toggle Star message (Starred message is user-specific, no broadcast needed)
export const toggleStarMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const userIdStr = (userId?._id || userId || '').toString();
    const isStarred = Boolean(
      userIdStr &&
      message.starredBy.some(
        (sId) => (sId?._id || sId || '').toString() === userIdStr
      )
    );

    if (isStarred) {
      // Unstar: remove all instances of this user ID
      message.starredBy = message.starredBy.filter(
        (sId) => (sId?._id || sId || '').toString() !== userIdStr
      );
    } else {
      // Star: push user ID once
      message.starredBy.push(userId);
    }

    await message.save();

    res.status(200).json({
      success: true,
      starredBy: message.starredBy,
      messageId: id,
      message: isStarred ? 'Message unstarred' : 'Message starred',
    });
  } catch (error) {
    console.error('toggleStarMessage error:', error.message);
    res.status(500).json({ success: false, message: 'Server error starring message' });
  }
};
