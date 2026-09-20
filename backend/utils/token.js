import jwt from 'jsonwebtoken';

/**
 * Retrieves the JWT access secret from environment variables.
 * Fails safely if missing or empty without exposing secret values.
 * @returns {string}
 */
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    throw new Error('JWT_SECRET environment variable is missing or empty.');
  }
  return secret;
};

/**
 * Retrieves the JWT refresh secret from environment variables.
 * Fails safely if missing or empty without exposing secret values.
 * @returns {string}
 */
export const getJwtRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    throw new Error('JWT_REFRESH_SECRET environment variable is missing or empty.');
  }
  return secret;
};

/**
 * Validates that all required JWT secrets are configured.
 * Throws a safe error without leaking any secret values if missing.
 */
export const validateJwtConfig = () => {
  getJwtSecret();
  getJwtRefreshSecret();
};

export const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, getJwtSecret(), {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign({ userId }, getJwtRefreshSecret(), {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};

/**
 * Returns consistent base cookie options across development and production.
 * - In production: secure: true, sameSite: 'none' (required for decoupled cross-origin frontend/backend).
 * - In development: secure: false, sameSite: 'lax' (compatible with HTTP localhost).
 * - httpOnly is always true and path is always '/'.
 * @returns {object}
 */
export const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
};

export const setTokenCookies = (res, accessToken, refreshToken) => {
  const cookieOptions = getCookieOptions();

  // Access Token Cookie (15 minutes)
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  // Refresh Token Cookie (7 days)
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearTokenCookies = (res) => {
  const cookieOptions = getCookieOptions();
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
};
