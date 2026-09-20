import express from 'express';
import { body } from 'express-validator';
import { register, login, logout, getMe, refresh } from '../controllers/auth.controller.js';
import { protectRoute } from '../middlewares/auth.middleware.js';
import { handleValidationErrors, passwordComplexityValidator } from '../middlewares/validation.middleware.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
    passwordComplexityValidator('password'),
  ],
  handleValidationErrors,
  register
);

router.post(
  '/login',
  authLimiter,
  [
    body('loginIdentifier').trim().notEmpty().withMessage('Email or Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidationErrors,
  login
);

router.post('/logout', protectRoute, logout);

router.post('/refresh', authLimiter, refresh);

router.get('/me', protectRoute, getMe);

export default router;

