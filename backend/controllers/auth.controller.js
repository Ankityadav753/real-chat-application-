import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { generateTokens, setTokenCookies, clearTokenCookies, getJwtRefreshSecret } from '../utils/token.js';
import { validatePasswordPolicy } from '../middlewares/validation.middleware.js';
import logger from '../utils/logger.js';

export const register = async (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ success: false, message: passwordValidation.message });
    }

    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }

    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ success: false, message: 'Username is already taken' });
    }

    const user = new User({
      name,
      username,
      email,
      password, // Will be hashed via pre-save Mongoose hook
    });

    await user.save();

    const tokens = generateTokens(user._id);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: userResponse,
    });
  } catch (error) {
    logger.error('Registration Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

export const login = async (req, res) => {
  try {
    const { loginIdentifier, password } = req.body; // loginIdentifier can be email or username

    const user = await User.findOne({
      $or: [{ email: loginIdentifier.toLowerCase() }, { username: loginIdentifier.toLowerCase() }],
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const tokens = generateTokens(user._id);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    // Update onlineStatus to true
    user.onlineStatus = true;
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userResponse,
    });
  } catch (error) {
    logger.error('Login Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

export const logout = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (userId) {
      // Set onlineStatus to false and update lastSeen
      await User.findByIdAndUpdate(userId, {
        onlineStatus: false,
        lastSeen: new Date(),
      });
    }

    clearTokenCookies(res);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error during logout' });
  }
};

export const getMe = async (req, res) => {
  try {
    // req.user is set by the protectRoute middleware
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    logger.error('GetMe Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error in getMe' });
  }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, getJwtRefreshSecret());
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
    }

    const tokens = generateTokens(user._id);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      user,
    });
  } catch (error) {
    logger.error('Refresh Token Error:', error.message);
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired refresh token' });
  }
};

