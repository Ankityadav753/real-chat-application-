import { Router } from 'express';
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  reactToMessage,
  toggleStarMessage,
} from '../controllers/message.controller.js';
import { protectRoute } from '../middlewares/auth.middleware.js';
import { upload, handleUpload } from '../middlewares/upload.middleware.js';

const router = Router();

router.use(protectRoute);

router.get('/:conversationId', getMessages);

// Support up to 5 attachments in a message
router.post('/', handleUpload(upload.array('attachments', 5)), sendMessage);

router.put('/:id', editMessage);
router.delete('/:id', deleteMessage);
router.put('/:id/react', reactToMessage);
router.put('/:id/star', toggleStarMessage);

export default router;
