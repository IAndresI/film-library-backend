import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getPlans,
  getUserSubscription,
} from '../controllers/subscriptionController';

const router = Router();

router.get('/plans', getPlans); // публичный endpoint
router.get('/my', authenticate, getUserSubscription); // текущая подписка пользователя

export default router;
