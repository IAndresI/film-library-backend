import { Router } from 'express';
import { authenticate, requireAdmin } from '../middlewares/authMiddleware';
import {
  getPlans,
  getUserSubscription,
  getAllSubscriptions,
  createManualSubscription,
  invalidateSubscription,
} from '../controllers/subscriptionController';

const router = Router();

router.get('/plans', getPlans); // публичный endpoint
router.get('/my', authenticate, getUserSubscription); // текущая подписка пользователя

// Админские роуты для ручного управления подписками
router.get('/all', requireAdmin, getAllSubscriptions); // получить все подписки (для админов)
router.post('/manual', requireAdmin, createManualSubscription); // ручное создание подписки
router.put('/invalidate/:userId', requireAdmin, invalidateSubscription); // инвалидация подписки

export default router;
