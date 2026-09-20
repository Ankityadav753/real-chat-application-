import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

import { connectDB } from './config/db.js';
import { app, server } from './socket/socket.js';

import { corsOptions } from './config/cors.js';
import { apiLimiter } from './middlewares/rateLimiter.middleware.js';
import logger from './utils/logger.js';
import { validateJwtConfig } from './utils/token.js';

// Route Imports
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import messageRoutes from './routes/message.routes.js';
import groupRoutes from './routes/group.routes.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Security Middlewares
// Explicit Content-Security-Policy tailored strictly to verified application requirements
app.use(
  helmet({
    crossOriginResourcePolicy: false, // Allows loading assets cross-origin if needed
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // Strictly no 'unsafe-eval'
        styleSrc: ["'self'", "'unsafe-inline'"], // Dynamic runtime inline styles for React/Tailwind
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://api.dicebear.com'],
        mediaSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'https://res.cloudinary.com',
          'https://api.dicebear.com',
          ...(process.env.NODE_ENV !== 'production'
            ? ['http://localhost:*', 'ws://localhost:*', 'http://127.0.0.1:*', 'ws://127.0.0.1:*']
            : []),
          ...(process.env.FRONTEND_URL
            ? process.env.FRONTEND_URL.split(',').map((url) => url.trim()).filter(Boolean)
            : []),
        ],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

// Local uploads static fallback serving (LOW-05)
// Architectural Note: In production, user attachments and avatars are streamed directly to Cloudinary CDN.
// For any local static file fallback, apply strict private no-cache headers to prevent accidental public caching of sensitive files.
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use(
  '/uploads',
  express.static(uploadsDir, {
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  })
);

// CORS Configuration
app.use(cors(corsOptions));

// Rate Limiter to prevent abuse across general API routes
app.use('/api/', apiLimiter);

// Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);

// Simple Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Chat App server is running smoothly.' });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled Server Error:', err.stack || err.message);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Start Server
const startServer = async () => {
  // Validate critical security environment variables (LOW-01)
  try {
    validateJwtConfig();
  } catch (configErr) {
    logger.error(`Startup Configuration Error: ${configErr.message}`);
    process.exit(1);
  }

  // Listen immediately so the server is responsive on its port
  server.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });

  // Attempt database connection in the background
  try {
    await connectDB();
  } catch (error) {
    logger.error('Failed to connect to Database on startup. Endpoints requiring database will fail.');
  }
};

startServer();
