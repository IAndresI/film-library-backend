import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService';

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { planId, redirectUrl } = req.body;
    const userId = req.user?.userId; // предполагаем что middleware auth добавляет user в req

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Необходима авторизация',
      });
      return;
    }

    if (!planId || !redirectUrl) {
      res.status(400).json({
        success: false,
        message: 'Необходимо указать planId и redirectUrl',
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
