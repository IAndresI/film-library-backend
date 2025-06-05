import { Request, Response, NextFunction } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { orders } from '../schema';

// Получить все заказы
export const getOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allOrders = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt));

    res.json(allOrders);
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

    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));

    res.json(userOrders);
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
