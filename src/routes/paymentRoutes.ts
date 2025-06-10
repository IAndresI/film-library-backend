import { Router } from 'express';
import {
  createSubscriptionPurchase,
  handleWebhook,
  createFilmPurchase,
} from '../controllers/paymentController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.post('/subscription/create', authenticate, createSubscriptionPurchase);
router.post('/film/create', authenticate, createFilmPurchase);
router.post('/webhook', handleWebhook); // без аутентификации для webhook от YooKassa

export default router;
