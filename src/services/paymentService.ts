import { db } from '../db/connection';
import {
  orders,
  subscriptions,
  subscriptionPlans,
  films,
  userPurchasedFilms,
} from '../schema';
import { eq, and, lt, desc, or, gt, isNull } from 'drizzle-orm';
import {
  ICreatePayment,
  Payment,
  YooCheckout,
  PaymentStatuses,
} from '@a2seven/yoo-checkout';
import config from '../config/config';
import { v4 as uuidv4 } from 'uuid';
import { INotification } from '../models/INotification';

const YouKassa = new YooCheckout({
  shopId: config.shopId,
  secretKey: config.shopKey,
});

export class PaymentService {
  async createSubscriptionPayment({
    userId,
    planId,
    redirectUrl,
  }: {
    userId: number;
    planId: number;
    redirectUrl: string;
  }): Promise<{
    success: boolean;
    message: string;
    payment?: Payment;
    orderId?: number;
  }> {
    try {
      // Получаем план подписки
      const plan = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId));

      if (!plan.length || !plan[0].isActive) {
        return {
          success: false,
          message: 'Тарифный план не найден или неактивен',
        };
      }

      const selectedPlan = plan[0];

      // Создаем заказ
      const [order] = await db
        .insert(orders)
        .values({
          userId,
          planId,
          amount: selectedPlan.price,
          currency: selectedPlan.currency,
          orderStatus: 'pending',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // заказ истекает через 24 часа
          orderType: 'subscription',
        })
        .returning();

      // Создаем платеж в YooKassa
      const createPayload: ICreatePayment = {
        amount: {
          value: selectedPlan.price,
          currency: selectedPlan.currency || 'RUB',
        },
        payment_method_data: {
          type: 'bank_card',
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: redirectUrl,
        },
        metadata: {
          userId,
          orderId: order.id,
          planId,
        },
        description: `Оплата подписки: ${selectedPlan.name}`,
      };

      const payment = await YouKassa.createPayment(createPayload, uuidv4());

      // Обновляем заказ с данными платежа
      await db
        .update(orders)
        .set({
          externalPaymentId: payment.id,
          paymentMethod: 'bank_card',
          metadata: payment,
        })
        .where(eq(orders.id, order.id));

      return {
        success: true,
        message: 'Платеж создан',
        payment,
        orderId: order.id,
      };
    } catch (error) {
      console.error('Payment creation error:', error);
      return {
        success: false,
        message: 'Ошибка создания платежа. Попробуйте позже.',
      };
    }
  }

  async createFilmPayment({
    userId,
    filmId,
    redirectUrl,
  }: {
    userId: number;
    filmId: number;
    redirectUrl: string;
  }): Promise<{
    success: boolean;
    message: string;
    payment?: Payment;
    orderId?: number;
  }> {
    try {
      // Получаем информацию о фильме
      const film = await db.select().from(films).where(eq(films.id, filmId));

      if (!film.length || !film[0].isPaid) {
        return {
          success: false,
          message: 'Фильм не найден или доступен бесплатно',
        };
      }

      const selectedFilm = film[0];

      // Проверяем, не куплен ли уже фильм
      const existingPurchase = await db
        .select()
        .from(userPurchasedFilms)
        .where(
          and(
            eq(userPurchasedFilms.userId, userId),
            eq(userPurchasedFilms.filmId, filmId),
          ),
        );

      if (existingPurchase.length > 0) {
        return {
          success: false,
          message: 'Этот фильм уже куплен',
        };
      }

      // Создаем заказ
      const [order] = await db
        .insert(orders)
        .values({
          userId,
          filmId,
          amount: selectedFilm.price?.toString() || '0',
          currency: 'RUB',
          orderType: 'film',
          orderStatus: 'pending',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // заказ истекает через 24 часа
        })
        .returning();

      // Создаем платеж в YooKassa
      const createPayload: ICreatePayment = {
        amount: {
          value: selectedFilm.price?.toString() || '0',
          currency: 'RUB',
        },
        payment_method_data: {
          type: 'bank_card',
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: redirectUrl,
        },
        metadata: {
          userId,
          orderId: order.id,
          filmId,
          type: 'film',
        },
        description: `Покупка фильма: ${selectedFilm.name}`,
      };

      const payment = await YouKassa.createPayment(createPayload, uuidv4());

      // Обновляем заказ с данными платежа
      await db
        .update(orders)
        .set({
          externalPaymentId: payment.id,
          paymentMethod: 'bank_card',
          metadata: payment,
        })
        .where(eq(orders.id, order.id));

      return {
        success: true,
        message: 'Платеж создан',
        payment,
        orderId: order.id,
      };
    } catch (error) {
      console.error('Payment creation error:', error);
      return {
        success: false,
        message: 'Ошибка создания платежа. Попробуйте позже.',
      };
    }
  }

  async handlePaymentWebhook(
    paymentData: INotification,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const {
        object: { id: paymentId, status, metadata },
      } = paymentData;
      const { orderId, userId, planId, filmId, type } = metadata as {
        orderId: number;
        userId: number;
        planId?: number;
        filmId?: number;
        type: 'subscription' | 'film';
      };

      // Обновляем статус заказа в зависимости от статуса платежа
      let orderStatus: string;
      const updateData: any = {};

      switch (status) {
        case PaymentStatuses.succeeded:
          orderStatus = 'paid';
          updateData.paidAt = new Date();
          break;
        case PaymentStatuses.canceled:
          orderStatus = 'cancelled';
          break;
        case PaymentStatuses.pending:
        case PaymentStatuses.waiting_for_capture:
          orderStatus = 'pending';
          break;
        default:
          orderStatus = 'failed';
      }

      updateData.orderStatus = orderStatus;

      await db
        .update(orders)
        .set(updateData)
        .where(eq(orders.externalPaymentId, paymentId));

      // Обрабатываем успешный платеж
      if (status === PaymentStatuses.succeeded) {
        if (planId) {
          // Обработка подписки
          const plan = await db
            .select()
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.id, planId));

          if (plan.length) {
            const startDate = new Date();
            const endDate = new Date(
              startDate.getTime() + plan[0].durationDays * 24 * 60 * 60 * 1000,
            );

            await db.insert(subscriptions).values({
              userId,
              planId,
              orderId,
              subscriptionStatus: 'active',
              startedAt: startDate,
              expiresAt: endDate,
            });
          }
        } else if (filmId) {
          // Обработка покупки фильма
          await db.insert(userPurchasedFilms).values({
            userId,
            filmId,
            orderId,
            purchasedAt: new Date(),
            expiresAt: null, // бессрочный доступ
          });
        }
      }

      return {
        success: true,
        message: 'Webhook обработан',
      };
    } catch (error) {
      console.error('Webhook processing error:', error);
      return {
        success: false,
        message: 'Ошибка обработки webhook',
      };
    }
  }

  async getPlans(): Promise<any[]> {
    return await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true));
  }

  async getUserSubscription(userId: number): Promise<any> {
    // Сначала обновляем статусы истекших подписок для пользователя
    await this.updateExpiredSubscriptions(userId);

    // Ищем последнюю подписку пользователя (активную или истекшую)
    const subscription = await db
      .select({
        id: subscriptions.id,
        subscriptionStatus: subscriptions.subscriptionStatus,
        startedAt: subscriptions.startedAt,
        expiresAt: subscriptions.expiresAt,
        autoRenew: subscriptions.autoRenew,
        planId: subscriptions.planId,
        planName: subscriptionPlans.name,
        planPrice: subscriptionPlans.price,
        planDurationDays: subscriptionPlans.durationDays,
        planDescription: subscriptionPlans.description,
      })
      .from(subscriptions)
      .leftJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      )
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.expiresAt))
      .limit(1);

    const result = subscription[0];
    if (!result) return null;

    return {
      id: result.id,
      subscriptionStatus: result.subscriptionStatus,
      startedAt: result.startedAt,
      expiresAt: result.expiresAt,
      autoRenew: result.autoRenew,
      plan: {
        id: result.planId,
        name: result.planName,
        price: result.planPrice,
        durationDays: result.planDurationDays,
        description: result.planDescription,
      },
    };
  }

  // Обновляет статус истекших подписок для конкретного пользователя
  async updateExpiredSubscriptions(userId?: number): Promise<void> {
    const now = new Date();

    const whereCondition = userId
      ? and(
          eq(subscriptions.subscriptionStatus, 'active'),
          lt(subscriptions.expiresAt, now),
          eq(subscriptions.userId, userId),
        )
      : and(
          eq(subscriptions.subscriptionStatus, 'active'),
          lt(subscriptions.expiresAt, now),
        );

    await db
      .update(subscriptions)
      .set({ subscriptionStatus: 'expired' })
      .where(whereCondition);
  }

  // Массовое обновление всех истекших подписок (для cron задачи)
  async updateAllExpiredSubscriptions(): Promise<{ updated: number }> {
    const now = new Date();

    const result = await db
      .update(subscriptions)
      .set({ subscriptionStatus: 'expired' })
      .where(
        and(
          eq(subscriptions.subscriptionStatus, 'active'),
          lt(subscriptions.expiresAt, now),
        ),
      )
      .returning({ id: subscriptions.id });

    return { updated: result.length };
  }

  // Проверяет активность подписки пользователя (для middleware доступа к контенту)
  async hasActiveSubscription(userId: number): Promise<boolean> {
    await this.updateExpiredSubscriptions(userId);

    const subscription = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.subscriptionStatus, 'active'),
        ),
      )
      .limit(1);

    return subscription.length > 0;
  }

  // Проверяет, куплен ли фильм у пользователя
  async hasUserPurchasedFilm(userId: number, filmId: number): Promise<boolean> {
    const purchase = await db
      .select()
      .from(userPurchasedFilms)
      .where(
        and(
          eq(userPurchasedFilms.userId, userId),
          eq(userPurchasedFilms.filmId, filmId),
          // Проверяем, что срок действия не истек (если он установлен)
          or(
            isNull(userPurchasedFilms.expiresAt),
            gt(userPurchasedFilms.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);

    return purchase.length > 0;
  }

  // Получить все купленные фильмы пользователя
  async getUserPurchasedFilms(userId: number): Promise<any[]> {
    return await db
      .select({
        id: userPurchasedFilms.id,
        purchasedAt: userPurchasedFilms.purchasedAt,
        expiresAt: userPurchasedFilms.expiresAt,
        filmId: films.id,
        filmName: films.name,
        filmDescription: films.description,
        filmImage: films.image,
        filmPrice: films.price,
      })
      .from(userPurchasedFilms)
      .innerJoin(films, eq(userPurchasedFilms.filmId, films.id))
      .where(
        and(
          eq(userPurchasedFilms.userId, userId),
          // Проверяем, что срок действия не истек (если он установлен)
          or(
            isNull(userPurchasedFilms.expiresAt),
            gt(userPurchasedFilms.expiresAt, new Date()),
          ),
        ),
      )
      .orderBy(desc(userPurchasedFilms.purchasedAt));
  }
}

export const paymentService = new PaymentService();
