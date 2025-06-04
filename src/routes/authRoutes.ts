import { Router } from 'express';
import {
  sendOTP,
  verifyOTP,
  verifyToken,
  getCurrentUser,
} from '../controllers/authController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

// POST /api/auth/send-otp - отправка OTP кода
router.post('/send-otp', sendOTP);

// POST /api/auth/verify-otp - проверка OTP и получение токена
router.post('/verify-otp', verifyOTP);

// GET /api/auth/verify-token - проверка действительности токена
router.get('/verify-token', verifyToken);

// GET /api/auth/me - получить текущего пользователя
router.get('/me', authenticate, getCurrentUser);

export default router;
