import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService';

export const getPlans = async (req: Request, res: Response) => {
  try {
    const plans = await paymentService.getPlans();

    res.json(plans);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Ошибка получения планов',
    });
  }
};

export const getUserSubscription = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Необходима авторизация',
      });
      return;
    }

    const subscription = await paymentService.getUserSubscription(userId);

    res.json(subscription);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Ошибка получения подписки',
    });
  }
};
