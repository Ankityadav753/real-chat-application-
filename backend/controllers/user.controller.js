import User from '../models/user.model.js';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.js';
import bcrypt from 'bcryptjs';
import { validatePasswordPolicy } from '../middlewares/validation.middleware.js';

/**
 * Safely escapes all regular expression metacharacters in a string so it can be
 * used in a RegExp constructor as a literal pattern.
 * @param {string} string
 * @returns {string}
 */
export const escapeRegex = (string) => {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Get user directory/search
export const getUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { search } = req.query;

    let query = { _id: { $ne: currentUserId } };

    // Validate type, trim, bound length, and escape regex metacharacters
    if (typeof search === 'string') {
      const trimmedSearch = search.trim();
      if (trimmedSearch.length > 0) {
        // Enforce maximum search length of 100 characters
        const boundedSearch = trimmedSearch.slice(0, 100);
        const escapedSearch = escapeRegex(boundedSearch);
        const searchRegex = new RegExp(escapedSearch, 'i');
        query.$or = [{ name: searchRegex }, { username: searchRegex }];
      }
    }

    const users = await User.find(query)
      .select('name username email profilePic bio onlineStatus lastSeen')
      .limit(50);

    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('getUsers error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
};

// Get single user by ID
export const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('name username email profilePic bio onlineStatus lastSeen createdAt');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('getUserProfile error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching user profile' });
  }
};

// Update profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, username, bio } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;

    if (username) {
      const usernameExists = await User.findOne({ username, _id: { $ne: userId } });
      if (usernameExists) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
      updateData.username = username;
    }

    // Handle Profile Picture upload if file is provided
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype, `avatar_${userId}`);
        updateData.profilePic = uploadResult.url;
      } catch (uploadError) {
        console.error('Profile picture upload failed:', uploadError.message || uploadError);
        const statusCode = uploadError.code === 'CLOUDINARY_NOT_CONFIGURED' ? 503 : 500;
        return res.status(statusCode).json({
          success: false,
          message: uploadError.code === 'CLOUDINARY_NOT_CONFIGURED'
            ? 'Media upload service is not configured on this server'
            : 'Failed to upload profile picture',
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('updateProfile error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};

// Update password
export const updatePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;

    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ success: false, message: passwordValidation.message });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    // Assigning new password will trigger the pre-save hook for hashing
    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('updatePassword error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating password' });
  }
};
