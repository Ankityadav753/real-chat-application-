import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryPublicId } from '../utils/cloudinaryUpload.js';
import { io } from '../socket/socket.js';

/**
 * Best-effort cleanup of Cloudinary assets associated with a group conversation
 * (group avatar and all message attachments).
 * Failures during Cloudinary deletion must not block database operations.
 */
const cleanupGroupAssets = async (group) => {
  try {
    const tasks = [];

    // 1. Clean up group avatar if hosted on Cloudinary
    if (group?.groupAvatar) {
      const avatarPublicId = extractCloudinaryPublicId(group.groupAvatar);
      if (avatarPublicId) {
        tasks.push(deleteFromCloudinary(avatarPublicId, 'image'));
      }
    }

    // 2. Clean up attachments from all messages in this group
    const messages = await Message.find({
      conversationId: group._id,
      'attachments.0': { $exists: true },
    });

    for (const msg of messages) {
      if (Array.isArray(msg.attachments)) {
        for (const att of msg.attachments) {
          const publicId = extractCloudinaryPublicId(att);
          if (publicId) {
            tasks.push(deleteFromCloudinary(publicId, att.type || 'file'));
          }
        }
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  } catch (err) {
    console.error('Best-effort group Cloudinary assets cleanup error:', err.message || err);
  }
};

// Create a group chat
export const createGroup = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { groupName, memberIds: memberIdsRaw } = req.body;

    if (!groupName) {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }

    // Parse memberIds if sent as stringified JSON (from FormData)
    let memberIds = [];
    if (memberIdsRaw) {
      try {
        memberIds = typeof memberIdsRaw === 'string' ? JSON.parse(memberIdsRaw) : memberIdsRaw;
      } catch (err) {
        memberIds = [];
      }
    }

    // Ensure admin is part of the participants
    const participants = Array.from(new Set([adminId.toString(), ...memberIds.map(id => id.toString())]));

    if (participants.length < 2) {
      return res.status(400).json({ success: false, message: 'A group must have at least one other member' });
    }

    let groupAvatar = '';
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype, `group_${Date.now()}`);
        groupAvatar = uploadResult.url;
      } catch (uploadError) {
        console.error('Group avatar upload failed:', uploadError.message || uploadError);
        const statusCode = uploadError.code === 'CLOUDINARY_NOT_CONFIGURED' ? 503 : 500;
        return res.status(statusCode).json({
          success: false,
          message: uploadError.code === 'CLOUDINARY_NOT_CONFIGURED'
            ? 'Media upload service is not configured on this server'
            : 'Failed to upload group avatar',
        });
      }
    }

    // Setup initial unread counts
    const unreadCounts = {};
    participants.forEach((id) => {
      unreadCounts[id] = 0;
    });

    const newGroup = new Conversation({
      participants,
      isGroup: true,
      groupName,
      groupAdmin: adminId,
      groupAvatar,
      unreadCounts,
    });

    await newGroup.save();

    const populatedGroup = await Conversation.findById(newGroup._id).populate(
      'participants',
      'name username profilePic onlineStatus lastSeen'
    );

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: populatedGroup,
    });
  } catch (error) {
    console.error('createGroup error:', error.message);
    res.status(500).json({ success: false, message: 'Server error creating group' });
  }
};

// Update group settings (Rename, update avatar)
export const updateGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { groupName } = req.body;

    const group = await Conversation.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Check if user is the admin
    const userIdStr = (userId?._id || userId || '').toString();
    if ((group.groupAdmin?._id || group.groupAdmin || '').toString() !== userIdStr) {
      return res.status(403).json({ success: false, message: 'Only group admin can update settings' });
    }

    const updateData = {};
    if (groupName) updateData.groupName = groupName;

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype, `group_avatar_${id}`);
        updateData.groupAvatar = uploadResult.url;
      } catch (uploadError) {
        console.error('Group avatar update failed:', uploadError.message || uploadError);
        const statusCode = uploadError.code === 'CLOUDINARY_NOT_CONFIGURED' ? 503 : 500;
        return res.status(statusCode).json({
          success: false,
          message: uploadError.code === 'CLOUDINARY_NOT_CONFIGURED'
            ? 'Media upload service is not configured on this server'
            : 'Failed to upload group avatar',
        });
      }
    }

    const updatedGroup = await Conversation.findByIdAndUpdate(id, updateData, { new: true })
      .populate('participants', 'name username profilePic onlineStatus lastSeen')
      .populate('groupAdmin', 'name username');

    // Real-time synchronization to group room (MED-03)
    io.to(`conversation:${id}`).emit('group-updated', {
      conversationId: id.toString(),
      groupName: updatedGroup.groupName,
      groupAvatar: updatedGroup.groupAvatar,
      groupAdmin: updatedGroup.groupAdmin,
      participants: updatedGroup.participants,
    });

    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      group: updatedGroup,
    });
  } catch (error) {
    console.error('updateGroup error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating group' });
  }
};

// Add members to group
export const addMembers = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { id } = req.params;
    const { memberIds } = req.body; // Array of user IDs

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Member IDs array is required' });
    }

    const group = await Conversation.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const adminIdStr = (adminId?._id || adminId || '').toString();
    if ((group.groupAdmin?._id || group.groupAdmin || '').toString() !== adminIdStr) {
      return res.status(403).json({ success: false, message: 'Only group admin can add members' });
    }

    // Add members using safe string normalized comparison
    const existingParticipants = group.participants.map((p) => (p?._id || p || '').toString());
    const newMembers = memberIds
      .map((m) => (m?._id || m || '').toString())
      .filter((mId) => mId && !existingParticipants.includes(mId));

    if (newMembers.length === 0) {
      return res.status(400).json({ success: false, message: 'All users are already members of this group' });
    }

    group.participants.push(...newMembers);

    // Initialize unread counts for new members
    newMembers.forEach((mId) => {
      group.unreadCounts.set(mId, 0);
    });

    await group.save();

    const populatedGroup = await Conversation.findById(id)
      .populate('participants', 'name username profilePic onlineStatus lastSeen')
      .populate('groupAdmin', 'name username');

    // Real-time synchronization to group room (MED-03)
    io.to(`conversation:${id}`).emit('group-updated', {
      conversationId: id.toString(),
      groupName: populatedGroup.groupName,
      groupAvatar: populatedGroup.groupAvatar,
      groupAdmin: populatedGroup.groupAdmin,
      participants: populatedGroup.participants,
      newMemberIds: newMembers,
    });

    res.status(200).json({
      success: true,
      message: 'Members added successfully',
      group: populatedGroup,
    });
  } catch (error) {
    console.error('addMembers error:', error.message);
    res.status(500).json({ success: false, message: 'Server error adding members' });
  }
};

// Remove members from group
export const removeMembers = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { id } = req.params;
    const { memberIds } = req.body; // Array of user IDs to remove

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Member IDs to remove are required' });
    }

    const group = await Conversation.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const adminIdStr = (adminId?._id || adminId || '').toString();
    if ((group.groupAdmin?._id || group.groupAdmin || '').toString() !== adminIdStr) {
      return res.status(403).json({ success: false, message: 'Only group admin can remove members' });
    }

    // Cannot remove group admin
    const memberIdsStrings = memberIds.map((m) => (m?._id || m || '').toString());
    const currentAdminIdStr = (group.groupAdmin?._id || group.groupAdmin || '').toString();
    if (memberIdsStrings.includes(currentAdminIdStr)) {
      return res.status(400).json({ success: false, message: 'Cannot remove the group admin' });
    }

    group.participants = group.participants.filter(
      (p) => !memberIdsStrings.includes((p?._id || p || '').toString())
    );

    // Remove from unread counts Map
    memberIdsStrings.forEach((mId) => {
      group.unreadCounts.delete(mId);
    });

    await group.save();

    const populatedGroup = await Conversation.findById(id)
      .populate('participants', 'name username profilePic onlineStatus lastSeen')
      .populate('groupAdmin', 'name username');

    // Real-time synchronization to group room (MED-03)
    io.to(`conversation:${id}`).emit('group-updated', {
      conversationId: id.toString(),
      groupName: populatedGroup.groupName,
      groupAvatar: populatedGroup.groupAvatar,
      groupAdmin: populatedGroup.groupAdmin,
      participants: populatedGroup.participants,
      removedMemberIds: memberIdsStrings,
    });

    res.status(200).json({
      success: true,
      message: 'Members removed successfully',
      group: populatedGroup,
    });
  } catch (error) {
    console.error('removeMembers error:', error.message);
    res.status(500).json({ success: false, message: 'Server error removing members' });
  }
};

// Leave group
export const leaveGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const group = await Conversation.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const userIdStr = (userId?._id || userId || '').toString();

    // Check if user is participant using safe string comparison
    const isParticipant = Boolean(
      userIdStr &&
      group.participants.some(
        (p) => (p?._id || p || '').toString() === userIdStr
      )
    );
    if (!isParticipant) {
      return res.status(400).json({ success: false, message: 'You are not a member of this group' });
    }

    // Remove participant
    group.participants = group.participants.filter(
      (p) => (p?._id || p || '').toString() !== userIdStr
    );
    group.unreadCounts.delete(userIdStr);

    // If leaving member was the admin, assign a new one
    if ((group.groupAdmin?._id || group.groupAdmin || '').toString() === userIdStr) {
      if (group.participants.length > 0) {
        group.groupAdmin = group.participants[0];
      } else {
        // No participants left, clean up assets and delete group
        await cleanupGroupAssets(group);
        await Conversation.findByIdAndDelete(id);
        await Message.deleteMany({ conversationId: id });
        io.to(`conversation:${id}`).emit('group-deleted', { conversationId: id.toString() });
        return res.status(200).json({ success: true, message: 'Left and deleted empty group successfully' });
      }
    }

    await group.save();

    const populatedGroup = await Conversation.findById(id)
      .populate('participants', 'name username profilePic onlineStatus lastSeen')
      .populate('groupAdmin', 'name username');

    // Real-time synchronization to group room (MED-03)
    io.to(`conversation:${id}`).emit('group-updated', {
      conversationId: id.toString(),
      groupName: populatedGroup.groupName,
      groupAvatar: populatedGroup.groupAvatar,
      groupAdmin: populatedGroup.groupAdmin,
      participants: populatedGroup.participants,
      leftUserId: userIdStr,
    });

    res.status(200).json({ success: true, message: 'Left group successfully' });
  } catch (error) {
    console.error('leaveGroup error:', error.message);
    res.status(500).json({ success: false, message: 'Server error leaving group' });
  }
};

// Delete group
export const deleteGroup = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { id } = req.params;

    const group = await Conversation.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const adminIdStr = (adminId?._id || adminId || '').toString();
    if ((group.groupAdmin?._id || group.groupAdmin || '').toString() !== adminIdStr) {
      return res.status(403).json({ success: false, message: 'Only group admin can delete the group' });
    }

    // Best-effort cleanup of Cloudinary assets before database deletion
    await cleanupGroupAssets(group);

    // Real-time notification of group deletion to conversation room (MED-03)
    io.to(`conversation:${id}`).emit('group-deleted', { conversationId: id.toString() });

    // Delete conversation and messages
    await Conversation.findByIdAndDelete(id);
    await Message.deleteMany({ conversationId: id });

    res.status(200).json({ success: true, message: 'Group and all associated messages deleted successfully' });
  } catch (error) {
    console.error('deleteGroup error:', error.message);
    res.status(500).json({ success: false, message: 'Server error deleting group' });
  }
};
