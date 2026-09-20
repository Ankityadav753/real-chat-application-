import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { generateTokens, setTokenCookies, getJwtSecret, getJwtRefreshSecret } from '../utils/token.js';

export const protectRoute = async (req, res, next) => {
  try {
    const { accessToken, refreshToken } = req.cookies;

    if (!accessToken) {
      // Access token is missing, check if refresh token is available
      if (!refreshToken) {
        return res.status(401).json({ success: false, message: 'Unauthorized: No tokens provided' });
      }

      // Verify Refresh Token
      try {
        const decodedRefresh = jwt.verify(refreshToken, getJwtRefreshSecret());
        const user = await User.findById(decodedRefresh.userId).select('-password');

        if (!user) {
          return res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
        }

        // Generate new tokens and refresh cookies
        const tokens = generateTokens(user._id);
        setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

        req.user = user;
        return next();
      } catch (refreshErr) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Session expired, please login again' });
      }
    }

    // Verify Access Token
    try {
      const decodedAccess = jwt.verify(accessToken, getJwtSecret());
      const user = await User.findById(decodedAccess.userId).select('-password');

      if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
      }

      req.user = user;
      next();
    } catch (accessErr) {
      // If access token is expired, try to refresh
      if (accessErr.name === 'TokenExpiredError') {
        if (!refreshToken) {
          return res.status(401).json({ success: false, message: 'Unauthorized: Access token expired, no refresh token' });
        }

        try {
          const decodedRefresh = jwt.verify(refreshToken, getJwtRefreshSecret());
          const user = await User.findById(decodedRefresh.userId).select('-password');

          if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
          }

          // Generate new tokens
          const tokens = generateTokens(user._id);
          setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

          req.user = user;
          return next();
        } catch (refreshErr) {
          return res.status(401).json({ success: false, message: 'Unauthorized: Session expired, please login again' });
        }
      }

      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid access token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(500).json({ success: false, message: 'Server error in auth middleware' });
  }
};
