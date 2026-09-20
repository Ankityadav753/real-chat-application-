import Conversation from '../models/conversation.model.js';

// Get all conversations for the current user
export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find conversations where the user is a participant
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name username profilePic bio onlineStatus lastSeen')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'senderId',
          select: 'name username',
        },
      })
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, conversations });
  } catch (error) {
    console.error('getConversations error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching conversations' });
  }
};

// Create or get a 1-to-1 conversation
export const createOrGetConversation = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ success: false, message: 'Participant ID is required' });
    }

    // Check if 1-to-1 conversation already exists
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [senderId, participantId] },
    })
      .populate('participants', 'name username profilePic bio onlineStatus lastSeen')
      .populate('lastMessage');

    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        participants: [senderId, participantId],
        isGroup: false,
        unreadCounts: {
          [senderId.toString()]: 0,
          [participantId.toString()]: 0,
        },
      });

      await conversation.save();
      conversation = await Conversation.findById(conversation._id).populate(
        'participants',
        'name username profilePic bio onlineStatus lastSeen'
      );
    }

    res.status(200).json({ success: true, conversation });
  } catch (error) {
    console.error('createOrGetConversation error:', error.message);
    res.status(500).json({ success: false, message: 'Server error creating/fetching conversation' });
  }
};

// Toggle Pin Conversation
export const togglePinConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const userIdStr = (userId?._id || userId || '').toString();
    const isPinned = Boolean(
      userIdStr &&
      conversation.pinnedBy.some(
        (pId) => (pId?._id || pId || '').toString() === userIdStr
      )
    );

    if (isPinned) {
      // Unpin: remove all instances of this user ID
      conversation.pinnedBy = conversation.pinnedBy.filter(
        (pId) => (pId?._id || pId || '').toString() !== userIdStr
      );
    } else {
      // Pin: push user ID once
      conversation.pinnedBy.push(userId);
    }

    await conversation.save();

    res.status(200).json({
      success: true,
      message: isPinned ? 'Conversation unpinned' : 'Conversation pinned',
      pinnedBy: conversation.pinnedBy,
    });
  } catch (error) {
    console.error('togglePinConversation error:', error.message);
    res.status(500).json({ success: false, message: 'Server error toggling pin' });
  }
};
