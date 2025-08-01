import { Request, Response, NextFunction } from 'express';
import { eq, desc, count, and } from 'drizzle-orm';
import { db } from '../db/connection';
import { orders, users, subscriptionPlans, films } from '../schema';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
} from '../utils/queryParser';
import {
  enrichFilmsWithDetails,
  getFilmSelectFields,
} from '../utils/filmUtils';
import { paymentService } from '../services/paymentService';

// Общий селект объект для всех запросов заказов
const getSelectFields = () => ({
  id: orders.id,
  userId: orders.userId,
  planId: orders.planId,
  filmId: orders.filmId,
  amount: orders.amount,
  orderStatus: orders.orderStatus,
  paymentMethod: orders.paymentMethod,
  createdAt: orders.createdAt,
  paidAt: orders.paidAt,
  expiresAt: orders.expiresAt,
  orderType: orders.orderType,
  externalPaymentId: orders.externalPaymentId,
  // Информация о пользователе
  userName: users.name,
  userEmail: users.email,
  userAvatar: users.avatar,
  userIsAdmin: users.isAdmin,
  userCreatedAt: users.createdAt,
  // Информация о плане (если это подписка)
  planName: subscriptionPlans.name,
  planPrice: subscriptionPlans.price,
  planDurationDays: subscriptionPlans.durationDays,
  planDescription: subscriptionPlans.description,
  // Информация о фильме (если это покупка фильма)
  filmName: films.name,
  filmPrice: films.price,
  filmDescription: films.description,
  filmImage: films.image,
});

// Общая функция для маппинга результатов
const mapOrdersData = (ordersData: any[], filmsDetails?: any[]) => {
  const filmsMap = new Map();

  // Создаем map для быстрого поиска обогащенных фильмов
  if (filmsDetails) {
    filmsDetails.forEach((film) => {
      filmsMap.set(film.id, film);
    });
  }

  return ordersData.map((order) => ({
    id: order.id,
    userId: order.userId,
    planId: order.planId,
    filmId: order.filmId,
    amount: order.amount,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    orderType: order.orderType,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
    externalPaymentId: order.externalPaymentId,
    user: {
      id: order.userId,
      name: order.userName,
      email: order.userEmail,
      avatar: order.userAvatar,
      isAdmin: order.userIsAdmin,
      createdAt: order.userCreatedAt,
    },
    ...(order.planId && {
      plan: {
        id: order.planId,
        name: order.planName,
        price: order.planPrice,
        durationDays: order.planDurationDays,
        description: order.planDescription,
      },
    }),
    ...(order.filmId && {
      film: filmsMap.get(order.filmId) || {
        id: order.filmId,
        name: order.filmName,
        price: order.filmPrice,
        description: order.filmDescription,
        image: order.filmImage,
      },
    }),
  }));
};

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
      .leftJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .leftJoin(films, eq(orders.filmId, films.id));

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

    // Обогащаем фильмы деталями если есть заказы с фильмами
    const filmIds = allOrders
      .filter((order) => order.filmId)
      .map((order) => order.filmId)
      .filter((id): id is number => id !== null);

    let enrichedFilms: any[] = [];
    if (filmIds.length > 0) {
      const { inArray } = await import('drizzle-orm');

      // Получаем базовые данные фильмов
      const filmsData =
        filmIds.length === 1
          ? await db
              .select(getFilmSelectFields())
              .from(films)
              .where(eq(films.id, filmIds[0]))
          : await db
              .select(getFilmSelectFields())
              .from(films)
              .where(inArray(films.id, filmIds));

      enrichedFilms = await enrichFilmsWithDetails(filmsData);
    }

    // Запрос общего количества
    const countQuery = db
      .select({ count: count() })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .leftJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .leftJoin(films, eq(orders.filmId, films.id));

    const totalCountResult = whereCondition
      ? await countQuery.where(whereCondition)
      : await countQuery;

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapOrdersData(allOrders, enrichedFilms),
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

// Получить заказ по ID (только для владельца)
export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ message: 'Необходима авторизация' });
      return;
    }

    const selectFields = getSelectFields();

    const order = await db
      .select(selectFields)
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .leftJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .leftJoin(films, eq(orders.filmId, films.id))
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .limit(1);

    if (!order[0]) {
      res.status(404).json({ message: 'Заказ не найден' });
      return;
    }

    // Обогащаем фильм деталями если есть
    let enrichedFilms: any[] = [];
    if (order[0].filmId) {
      const filmsData = await db
        .select(getFilmSelectFields())
        .from(films)
        .where(eq(films.id, order[0].filmId));

      enrichedFilms = await enrichFilmsWithDetails(filmsData);
    }

    const orderWithDetails = mapOrdersData(order, enrichedFilms)[0];

    await paymentService.checkAndProcessOrder(orderWithDetails);

    res.json(orderWithDetails);
  } catch (error) {
    next(error);
  }
};

// Получить заказ по ID (только для админов)
export const getOrderByIdAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const selectFields = getSelectFields();

    const order = await db
      .select(selectFields)
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .leftJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .leftJoin(films, eq(orders.filmId, films.id))
      .where(eq(orders.id, id))
      .limit(1);

    if (!order[0]) {
      res.status(404).json({ message: 'Заказ не найден' });
      return;
    }

    // Обогащаем фильм деталями если есть
    let enrichedFilms: any[] = [];
    if (order[0].filmId) {
      const filmsData = await db
        .select(getFilmSelectFields())
        .from(films)
        .where(eq(films.id, order[0].filmId));

      enrichedFilms = await enrichFilmsWithDetails(filmsData);
    }

    res.json(mapOrdersData(order, enrichedFilms)[0]);
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
    const currentUserId = req.user?.userId;
    const isAdmin = req.user?.isAdmin;

    // Проверяем, что пользователь запрашивает свои заказы или является админом
    if (!isAdmin && currentUserId !== userId) {
      res.status(403).json({ message: 'Доступ запрещен' });
      return;
    }

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
      .leftJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .leftJoin(films, eq(orders.filmId, films.id));

    // Запрос данных с пагинацией
    const queryWithOrder = orderByClause
      ? baseQuery.where(finalCondition).orderBy(orderByClause)
      : baseQuery.where(finalCondition).orderBy(desc(orders.createdAt));

    const userOrders = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Обогащаем фильмы деталями если есть заказы с фильмами
    const filmIds = userOrders
      .filter((order) => order.filmId)
      .map((order) => order.filmId)
      .filter((id): id is number => id !== null);

    let enrichedFilms: any[] = [];
    if (filmIds.length > 0) {
      const { inArray } = await import('drizzle-orm');

      // Получаем базовые данные фильмов
      const filmsData =
        filmIds.length === 1
          ? await db
              .select(getFilmSelectFields())
              .from(films)
              .where(eq(films.id, filmIds[0]))
          : await db
              .select(getFilmSelectFields())
              .from(films)
              .where(inArray(films.id, filmIds));

      enrichedFilms = await enrichFilmsWithDetails(filmsData);
    }

    // Запрос общего количества
    const countQuery = db
      .select({ count: count() })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .leftJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .leftJoin(films, eq(orders.filmId, films.id))
      .where(finalCondition);

    const totalCountResult = await countQuery;
    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapOrdersData(userOrders, enrichedFilms),
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

export const checkOrderPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user.userId;
    const orderId = parseInt(req.params.orderId, 10);

    const [order] = await db
      .select({
        id: orders.id,
        userId: orders.userId,
        planId: orders.planId,
        filmId: orders.filmId,
        amount: orders.amount,
        orderStatus: orders.orderStatus,
        paymentMethod: orders.paymentMethod,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        expiresAt: orders.expiresAt,
        orderType: orders.orderType,
        externalPaymentId: orders.externalPaymentId,
        planDurationDays: subscriptionPlans.durationDays,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .leftJoin(subscriptionPlans, eq(orders.planId, subscriptionPlans.id))
      .limit(1);

    if (!order) {
      res.status(404).json({ message: 'Заказ не найден' });
      return;
    }

    const updateStatus = await paymentService.checkAndProcessOrder(order);

    res.json(updateStatus);
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
    const { userId, planId, filmId, amount, currency = 'RUB' } = req.body;
    const orderType = planId ? 'subscription' : 'film';

    // Проверяем, что указан либо planId, либо filmId, но не оба
    if ((planId && filmId) || (!planId && !filmId)) {
      res.status(400).json({
        message:
          'Необходимо указать либо planId для подписки, либо filmId для покупки фильма',
      });
      return;
    }

    // Проверяем соответствие типа заказа и ID
    if (orderType === 'subscription' && !planId) {
      res.status(400).json({
        message: 'Для заказа подписки необходимо указать planId',
      });
      return;
    }

    if (orderType === 'film' && !filmId) {
      res.status(400).json({
        message: 'Для покупки фильма необходимо указать filmId',
      });
      return;
    }

    // Если это заказ фильма, проверяем его существование и платность
    if (filmId) {
      const film = await db
        .select()
        .from(films)
        .where(eq(films.id, filmId))
        .limit(1);

      if (!film[0]) {
        res.status(404).json({ message: 'Фильм не найден' });
        return;
      }

      if (!film[0].isPaid) {
        res.status(400).json({ message: 'Этот фильм доступен бесплатно' });
        return;
      }

      // Проверяем, что сумма заказа соответствует цене фильма
      if (film[0].price?.toString() !== amount?.toString()) {
        res.status(400).json({
          message: 'Сумма заказа не соответствует цене фильма',
        });
        return;
      }
    }

    // Если это заказ подписки, проверяем план
    if (planId) {
      const plan = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);

      if (!plan[0]) {
        res.status(404).json({ message: 'План подписки не найден' });
        return;
      }

      // Проверяем, что сумма заказа соответствует цене плана
      if (plan[0].price?.toString() !== amount?.toString()) {
        res.status(400).json({
          message: 'Сумма заказа не соответствует цене плана подписки',
        });
        return;
      }
    }

    // Создаем заказ
    const newOrder = await db
      .insert(orders)
      .values({
        userId,
        planId,
        filmId,
        amount,
        currency,
        orderType,
        orderStatus: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 часа на оплату
      })
      .returning();

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
