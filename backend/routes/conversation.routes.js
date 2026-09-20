import { Router } from 'express';
import { getConversations, createOrGetConversation, togglePinConversation } from '../controllers/conversation.controller.js';
import { protectRoute } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(protectRoute);

router.get('/', getConversations);
router.post('/', createOrGetConversation);
router.put('/:id/pin', togglePinConversation);

export default router;
