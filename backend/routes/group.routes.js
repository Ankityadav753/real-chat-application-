import { Router } from 'express';
import {
  createGroup,
  updateGroup,
  addMembers,
  removeMembers,
  leaveGroup,
  deleteGroup,
} from '../controllers/group.controller.js';
import { protectRoute } from '../middlewares/auth.middleware.js';
import { upload, handleUpload } from '../middlewares/upload.middleware.js';

const router = Router();

router.use(protectRoute);

router.post('/', handleUpload(upload.single('groupAvatar')), createGroup);
router.put('/:id', handleUpload(upload.single('groupAvatar')), updateGroup);
router.put('/:id/add-members', addMembers);
router.put('/:id/remove-members', removeMembers);
router.put('/:id/leave', leaveGroup);
router.delete('/:id', deleteGroup);

export default router;
