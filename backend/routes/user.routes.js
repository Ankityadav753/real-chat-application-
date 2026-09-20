import { Router } from 'express';
import { body } from 'express-validator';
import { getUsers, getUserProfile, updateProfile, updatePassword } from '../controllers/user.controller.js';
import { protectRoute } from '../middlewares/auth.middleware.js';
import { upload, handleUpload } from '../middlewares/upload.middleware.js';
import { handleValidationErrors, passwordComplexityValidator } from '../middlewares/validation.middleware.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

router.use(protectRoute);

router.get('/', getUsers);

router.get('/user/:id', getUserProfile);

router.put('/profile', handleUpload(upload.single('profilePic')), updateProfile);

router.put(
  '/password',
  authLimiter,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    passwordComplexityValidator('newPassword'),
  ],
  handleValidationErrors,
  updatePassword
);

export default router;
