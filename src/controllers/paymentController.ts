import { NextFunction, Request, Response } from 'express';
import { paymentService } from '../services/paymentService';

export const createSubscriptionPurchase = async (
  req: Request,
  res: Response,
) => {
  try {
    const { planId, redirectUrl } = req.body;
    const userId = req.user.userId;

    if (!planId) {
      res.status(400).json({
        success: false,
        message: 'Необходимо указать planId',
      });
      return;
    }

    const result = await paymentService.createSubscriptionPayment({
      userId,
      planId,
      redirectUrl,
    });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        paymentUrl: result.payment?.confirmation?.confirmation_url,
        orderId: result.orderId,
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера',
    });
  }
};

// Создать платеж для покупки фильма
export const createFilmPurchase = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId, filmId } = req.body;

    const result = await paymentService.createFilmPayment({
      userId,
      filmId,
    });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        paymentUrl: result.payment?.confirmation?.confirmation_url,
        orderId: result.orderId,
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    next(error);
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const paymentData = req.body;

    const result = await paymentService.handlePaymentWebhook(paymentData);

    if (result.success) {
      res.status(200).json({ received: true });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
