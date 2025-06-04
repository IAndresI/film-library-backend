import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  createPayment,
  handleWebhook,
  getPlans,
  getUserSubscription,
} from '../controllers/paymentController';

const router = Router();

router.post('/create', authenticate, createPayment);
router.post('/webhook', handleWebhook); // без аутентификации для webhook от YooKassa
router.get('/plans', getPlans); // публичный endpoint
router.get('/subscription', authenticate, getUserSubscription);

export default router;
