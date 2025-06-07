import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getPlans,
  getUserSubscription,
  createManualSubscription,
  invalidateSubscription,
} from '../controllers/subscriptionController';

const router = Router();

router.get('/plans', getPlans); // публичный endpoint
router.get('/my', authenticate, getUserSubscription); // текущая подписка пользователя

// Админские роуты для ручного управления подписками
router.post('/manual', createManualSubscription); // ручное создание подписки
router.put('/invalidate/:userId', invalidateSubscription); // инвалидация подписки

export default router;
