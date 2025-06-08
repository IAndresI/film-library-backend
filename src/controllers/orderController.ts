import { Request, Response, NextFunction } from 'express';
import { eq, desc, count, and } from 'drizzle-orm';
import { db } from '../db/connection';
import { orders, users, subscriptionPlans } from '../schema';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
} from '../utils/queryParser';

// Общий селект объект для всех запросов заказов
const getSelectFields = () => ({
  id: orders.id,
  userId: orders.userId,
  planId: orders.planId,
  amount: orders.amount,
  status: orders.status,
  paymentMethod: orders.paymentMethod,
  createdAt: orders.createdAt,
  paidAt: orders.paidAt,
  expiresAt: orders.expiresAt,
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
const mapOrdersData = (ordersData: any[]) =>
  ordersData.map((order) => ({
    id: order.id,
    userId: order.userId,
    planId: order.planId,
    amount: order.amount,
    status: order.status,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
    user: {
      id: order.userId,
      name: order.userName,
      email: order.userEmail,
      avatar: order.userAvatar,
      isAdmin: order.userIsAdmin,
      createdAt: order.userCreatedAt,
    },
    plan: {
      id: order.planId,
      name: order.planName,
      price: order.planPrice,
      durationDays: order.planDurationDays,
      description: order.planDescription,
    },
  }));

// Получить все заказы
export const getOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectFields = getSelectFields();

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовый запрос с JOIN-ами
    const baseQuery = db
      .select(selectFields)
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .innerJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id));

    // Запрос данных с пагинацией
    const ordersQuery = whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery;

    const queryWithOrder = orderByClause
      ? ordersQuery.orderBy(orderByClause)
      : ordersQuery.orderBy(desc(orders.createdAt));

    const allOrders = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const countQuery = db
      .select({ count: count() })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .innerJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id));

    const totalCountResult = whereCondition
      ? await countQuery.where(whereCondition)
      : await countQuery;

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapOrdersData(allOrders),
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
    next(error);
  }
};

// Получить заказ по ID
export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const order = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order[0]) {
      res.status(404).json({ message: 'Заказ не найден' });
      return;
    }

    res.json(order[0]);
  } catch (error) {
    next(error);
  }
};

// Получить заказы пользователя
export const getUserOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const selectFields = getSelectFields();

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовое условие: заказы конкретного пользователя
    const baseCondition = eq(orders.userId, userId);

    // Комбинируем с дополнительными фильтрами
    const finalCondition = whereCondition
      ? and(baseCondition, whereCondition)
      : baseCondition;

    // Базовый запрос с JOIN-ами
    const baseQuery = db
      .select(selectFields)
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .innerJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id));

    // Запрос данных с пагинацией
    const queryWithOrder = orderByClause
      ? baseQuery.where(finalCondition).orderBy(orderByClause)
      : baseQuery.where(finalCondition).orderBy(desc(orders.createdAt));

    const userOrders = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const countQuery = db
      .select({ count: count() })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .innerJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .where(finalCondition);

    const totalCountResult = await countQuery;
    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapOrdersData(userOrders),
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
    next(error);
  }
};

// Создать заказ
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderData = req.body;

    const newOrder = await db.insert(orders).values(orderData).returning();

    res.status(201).json(newOrder[0]);
  } catch (error) {
    next(error);
  }
};

// Обновить заказ
export const updateOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updateData = req.body;

    const updatedOrder = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();

    if (!updatedOrder[0]) {
      res.status(404).json({ message: 'Заказ не найден' });
      return;
    }

    res.json(updatedOrder[0]);
  } catch (error) {
    next(error);
  }
};

// Удалить заказ
export const deleteOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const deletedOrder = await db
      .delete(orders)
      .where(eq(orders.id, id))
      .returning();

    if (!deletedOrder[0]) {
      res.status(404).json({ message: 'Заказ не найден' });
      return;
    }

    res.json({ message: 'Заказ удален' });
  } catch (error) {
    next(error);
  }
};
