import dotenv from 'dotenv';

dotenv.config();

/**
 * Returns the list of explicitly configured allowed origins.
 * Parses FRONTEND_URL from environment, supporting comma-separated domains.
 * In development, automatically includes standard localhost / 127.0.0.1 origins.
 * @returns {string[]}
 */
export const getAllowedOrigins = () => {
  const frontendUrl = process.env.FRONTEND_URL || '';
  const configuredOrigins = frontendUrl
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    const devDefaults = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
    ];
    return Array.from(new Set([...configuredOrigins, ...devDefaults]));
  }

  return configuredOrigins;
};

/**
 * Validates whether an incoming origin header is allowed.
 * - Requests without an origin (e.g. server-to-server, mobile, curl) are permitted.
 * - In development, any localhost or 127.0.0.1 port is permitted.
 * - In production, strictly matches configured origins.
 * @param {string|undefined} origin - The Origin header value
 * @returns {boolean}
 */
export const isOriginAllowed = (origin) => {
  // Allow requests with no origin (like mobile apps, curl, or server-to-server requests)
  if (!origin) return true;

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // In non-production environments, allow any localhost or 127.0.0.1 port
  if (process.env.NODE_ENV !== 'production') {
    if (
      origin === 'http://localhost' ||
      origin.startsWith('http://localhost:') ||
      origin === 'http://127.0.0.1' ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Express CORS middleware options.
 * Avoids throwing generic 500 errors on disallowed origins by passing false cleanly.
 */
export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      // Return false so Express CORS omits access headers cleanly without crashing
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
};

/**
 * Socket.io CORS options for cross-origin WebSocket and HTTP polling.
 */
export const socketCorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
};
