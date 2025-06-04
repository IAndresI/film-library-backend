import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { createPayment, handleWebhook } from '../controllers/paymentController';

const router = Router();

router.post('/create', authenticate, createPayment);
router.post('/webhook', handleWebhook); // без аутентификации для webhook от YooKassa

export default router;
