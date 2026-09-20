/**
 * Centralized structured and sanitized logging utility.
 * Protects against accidental exposure of secrets, credentials, tokens,
 * cookies, and authorization headers in production logs.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'auth',
  'cookie',
  'cookies',
  'set-cookie',
  'secret',
  'jwt_secret',
  'jwt_refresh_secret',
  'cloudinary_api_secret',
  'cloudinary_api_key',
  'api_secret',
  'apikey',
  'api_key',
]);

const BEARER_REGEX = /(Bearer\s+)[A-Za-z0-9-_=.]+/gi;
const JWT_REGEX = /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const COOKIE_REGEX = /(accessToken|refreshToken)=[^;]+/gi;
const KEY_VALUE_SECRET_REGEX = /(password|currentpassword|newpassword|secret|token|accesstoken|refreshtoken)\s*[:=]\s*["']?([^\s,"';]+)["']?/gi;

/**
 * Recursively sanitizes any data structure, replacing passwords, tokens,
 * cookies, and auth secrets with redacted placeholders.
 *
 * @param {any} data - Data to sanitize
 * @param {number} [depth=0] - Recursion depth limit
 * @returns {any} Sanitized clone of data
 */
export const sanitize = (data, depth = 0) => {
  if (depth > 8) return '[MAX_DEPTH_REACHED]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return data
      .replace(BEARER_REGEX, '$1[REDACTED_TOKEN]')
      .replace(COOKIE_REGEX, '$1=[REDACTED_COOKIE]')
      .replace(KEY_VALUE_SECRET_REGEX, '$1=[REDACTED]')
      .replace(JWT_REGEX, '[REDACTED_JWT]');
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitize(data.message, depth + 1),
      stack: process.env.NODE_ENV === 'production'
        ? undefined
        : sanitize(data.stack, depth + 1),
    };
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitize(value, depth + 1);
      }
    }
    return sanitizedObj;
  }

  return String(data);
};

/**
 * Formats a log line with timestamp and severity tag.
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {any[]} args
 * @returns {string}
 */
const formatLog = (level, message, args = []) => {
  const timestamp = new Date().toISOString();
  const sanitizedMessage = sanitize(message);
  if (args.length === 0) {
    return `[${timestamp}] [${level}] ${sanitizedMessage}`;
  }
  const sanitizedArgs = args.map((arg) => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(sanitize(arg));
      } catch (e) {
        return '[Unserializable]';
      }
    }
    return sanitize(arg);
  });
  return `[${timestamp}] [${level}] ${sanitizedMessage} ${sanitizedArgs.join(' ')}`;
};

export const logger = {
  info: (message, ...args) => {
    const formatted = formatLog('INFO', message, args);
    console.log(formatted);
    return formatted;
  },

  warn: (message, ...args) => {
    const formatted = formatLog('WARN', message, args);
    console.warn(formatted);
    return formatted;
  },

  error: (message, ...args) => {
    const formatted = formatLog('ERROR', message, args);
    console.error(formatted);
    return formatted;
  },

  // Export internal sanitizer for test verification and route use
  sanitize,
};

export default logger;
