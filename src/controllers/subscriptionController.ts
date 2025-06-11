import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService';
import { db } from '../db/connection';
import { subscriptions, subscriptionPlans, users } from '../schema';
import { eq, and, count, desc } from 'drizzle-orm';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
} from '../utils/queryParser';

// Общий селект объект для всех запросов подписок
const getSelectFields = () => ({
  id: subscriptions.id,
  userId: subscriptions.userId,
  planId: subscriptions.planId,
  orderId: subscriptions.orderId,
  subscriptionStatus: subscriptions.subscriptionStatus,
  startedAt: subscriptions.startedAt,
  expiresAt: subscriptions.expiresAt,
  autoRenew: subscriptions.autoRenew,
  createdAt: subscriptions.createdAt,
  // Информация о пользователе
  userName: users.name,
  userEmail: users.email,
  userAvatar: users.avatar,
  userIsAdmin: users.isAdmin,
  userCreatedAt: users.createdAt,
  // Информация о плане
  planName: subscriptionPlans.name,
  planPrice: subscriptionPlans.price,
  planDurationDays: subscriptionPlans.durationDays,
  planDescription: subscriptionPlans.description,
});

// Общая функция для маппинга результатов
const mapSubscriptionsData = (subscriptionsData: any[]) =>
  subscriptionsData.map((subscription) => ({
    id: subscription.id,
    userId: subscription.userId,
    planId: subscription.planId,
    orderId: subscription.orderId,
    subscriptionStatus: subscription.subscriptionStatus,
    startedAt: subscription.startedAt,
    expiresAt: subscription.expiresAt,
    autoRenew: subscription.autoRenew,
    createdAt: subscription.createdAt,
    user: {
      id: subscription.userId,
      name: subscription.userName,
      email: subscription.userEmail,
      avatar: subscription.userAvatar,
      isAdmin: subscription.userIsAdmin,
      createdAt: subscription.userCreatedAt,
    },
    plan: {
      id: subscription.planId,
      name: subscription.planName,
      price: subscription.planPrice,
      durationDays: subscription.planDurationDays,
      description: subscription.planDescription,
    },
  }));

// Получить все подписки (для админов)
export const getAllSubscriptions = async (req: Request, res: Response) => {
  try {
    const selectFields = getSelectFields();

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовый запрос с JOIN-ами
    const baseQuery = db
      .select(selectFields)
      .from(subscriptions)
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      );

    // Запрос данных с пагинацией
    const subscriptionsQuery = whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery;

    const queryWithOrder = orderByClause
      ? subscriptionsQuery.orderBy(orderByClause)
      : subscriptionsQuery.orderBy(desc(subscriptions.createdAt));

    const allSubscriptions = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const countQuery = db
      .select({ count: count() })
      .from(subscriptions)
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      );

    const totalCountResult = whereCondition
      ? await countQuery.where(whereCondition)
      : await countQuery;

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapSubscriptionsData(allSubscriptions),
      pagination: {
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages,
        hasNextPage: pagination.pageIndex < totalPages - 1,
        hasPreviousPage: pagination.pageIndex > 0,
      },
    });
  } catch (error) {
    console.error('Ошибка получения подписок:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения подписок',
    });
  }
};

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
    const userId = req.user.userId;

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
      .set({ subscriptionStatus: 'cancelled' })
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.subscriptionStatus, 'active'),
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
        subscriptionStatus: 'active',
        startedAt: new Date(),
        expiresAt,
        autoRenew: false,
      })
      .returning();

    // Возвращаем подписку с информацией о плане
    const subscriptionWithPlan = {
      ...newSubscription[0],
      plan: {
        id: plan[0].id,
        name: plan[0].name,
        price: plan[0].price,
        durationDays: plan[0].durationDays,
        description: plan[0].description,
      },
    };

    res.status(201).json(subscriptionWithPlan);
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
          eq(subscriptions.subscriptionStatus, 'active'),
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
        subscriptionStatus: 'cancelled',
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
