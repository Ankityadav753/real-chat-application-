import rateLimit from 'express-rate-limit';

/**
 * PRODUCTION CLUSTERING / DISTRIBUTED ARCHITECTURE NOTE:
 * =======================================================
 * These rate limiters use express-rate-limit's default in-memory store (MemoryStore).
 * In-memory rate limiting is bound to the single Node.js process instance.
 *
 * In a clustered or horizontally scaled production deployment (e.g. multiple Kubernetes pods,
 * AWS ECS tasks, or multiple PM2 cluster workers), each instance maintains its own independent
 * memory store and request counter.
 *
 * For distributed horizontal scaling in multi-instance environments:
 * - Back this limiter with a shared distributed store (such as `rate-limit-redis` with Redis), or
 * - Delegate edge rate limiting to an API Gateway / reverse proxy (such as Cloudflare, Nginx, or AWS WAF).
 *
 * For single-instance server deployments, this in-memory limiter provides robust, low-latency
 * protection against brute-force attacks without requiring external network dependencies.
 */

// Broad API rate limiter to protect all /api/ routes against general volumetric abuse
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

/**
 * Factory to create dedicated authentication rate limiters.
 * Allows custom configuration in unit tests or environment-specific overrides.
 *
 * @param {object} [customOptions={}]
 * @returns {import('express-rate-limit').RateLimitRequestHandler}
 */
export const createAuthLimiter = (customOptions = {}) => {
  const windowMs = customOptions.windowMs !== undefined
    ? customOptions.windowMs
    : (process.env.AUTH_RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10)
      : 15 * 60 * 1000); // 15 minutes default

  const max = customOptions.max !== undefined
    ? customOptions.max
    : (process.env.AUTH_RATE_LIMIT_MAX
      ? parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10)
      : 20); // 20 requests per window default

  const message = customOptions.message || 'Too many authentication attempts. Please try again later.';

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
      });
    },
    ...customOptions,
  });
};

// Dedicated stricter rate limiter for sensitive authentication endpoints (login, register, refresh, password)
export const authLimiter = createAuthLimiter();
