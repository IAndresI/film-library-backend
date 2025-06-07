import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService';
import { db } from '../db/connection';
import { subscriptions, subscriptionPlans } from '../schema';
import { eq, and } from 'drizzle-orm';

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

// Ручное создание подписки (без orderId)
export const createManualSubscription = async (req: Request, res: Response) => {
  try {
    const { userId, planId } = req.body;

    if (!userId || !planId) {
      res.status(400).json({
        success: false,
        message: 'userId и planId обязательны',
      });
      return;
    }

    // Проверяем существование плана
    const plan = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!plan[0]) {
      res.status(404).json({
        success: false,
        message: 'План подписки не найден',
      });
      return;
    }

    // Отключаем текущие активные подписки пользователя
    await db
      .update(subscriptions)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active'),
        ),
      );

    // Создаем новую подписку используя длительность из плана
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan[0].durationDays);

    const newSubscription = await db
      .insert(subscriptions)
      .values({
        userId,
        planId,
        orderId: null, // Ручная подписка без orderId
        status: 'active',
        startedAt: new Date(),
        expiresAt,
        autoRenew: false,
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Подписка успешно создана',
      subscription: newSubscription[0],
    });
  } catch (error) {
    console.error('Ошибка создания подписки:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка создания подписки',
    });
  }
};

// Ручная инвалидация подписки
export const invalidateSubscription = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'userId обязателен',
      });
      return;
    }

    // Находим активную подписку пользователя
    const activeSubscription = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, parseInt(userId)),
          eq(subscriptions.status, 'active'),
        ),
      )
      .limit(1);

    if (!activeSubscription[0]) {
      res.status(404).json({
        success: false,
        message: 'Активная подписка не найдена',
      });
      return;
    }

    // Инвалидируем подписку
    const invalidatedSubscription = await db
      .update(subscriptions)
      .set({
        status: 'cancelled',
        expiresAt: new Date(), // Устанавливаем срок истечения на текущее время
      })
      .where(eq(subscriptions.id, activeSubscription[0].id))
      .returning();

    res.json(invalidatedSubscription[0]);
  } catch (error) {
    console.error('Ошибка инвалидации подписки:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка инвалидации подписки',
    });
  }
};
