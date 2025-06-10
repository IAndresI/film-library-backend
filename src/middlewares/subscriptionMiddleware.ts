import { Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/paymentService';

// Middleware для проверки активной подписки
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const hasSubscription = await paymentService.hasActiveSubscription(
      req.user.userId,
    );

    if (!hasSubscription) {
      res.status(403).json({
        success: false,
        message: 'Для доступа к контенту необходима активная подписка',
        code: 'SUBSCRIPTION_REQUIRED',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера',
    });
  }
};
