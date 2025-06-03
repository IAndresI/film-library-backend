import { Request, Response, NextFunction } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { reviews, users, films } from '../schema';

// Получить все одобренные отзывы для фильма
export const getApprovedReviews = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filmId = parseInt(req.params.filmId, 10);

    const approvedReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        text: reviews.text,
        createdAt: reviews.createdAt,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.filmId, filmId) && eq(reviews.isApproved, true))
      .orderBy(desc(reviews.createdAt));

    res.json(approvedReviews);
  } catch (error) {
    next(error);
  }
};

// Получить все отзывы (для админов)
export const getAllReviews = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        text: reviews.text,
        isApproved: reviews.isApproved,
        createdAt: reviews.createdAt,
        userName: users.name,
        userAvatar: users.avatar,
        filmName: films.name,
        filmId: films.id,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id))
      .orderBy(desc(reviews.createdAt));

    res.json(allReviews);
  } catch (error) {
    next(error);
  }
};

// Получить неодобренные отзывы (для модерации)
export const getPendingReviews = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const pendingReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        text: reviews.text,
        createdAt: reviews.createdAt,
        userName: users.name,
        userAvatar: users.avatar,
        filmName: films.name,
        filmId: films.id,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id))
      .where(eq(reviews.isApproved, false))
      .orderBy(desc(reviews.createdAt));

    res.json(pendingReviews);
  } catch (error) {
    next(error);
  }
};

// Создать отзыв
export const createReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { rating, text, userId, filmId } = req.body;

    const newReview = await db
      .insert(reviews)
      .values({
        rating,
        text,
        userId,
        filmId,
        isApproved: false, // По умолчанию требует модерации
      })
      .returning();

    res.status(201).json({
      ...newReview[0],
      message: 'Отзыв отправлен на модерацию',
    });
  } catch (error) {
    next(error);
  }
};

// Одобрить отзыв
export const approveReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const approvedReview = await db
      .update(reviews)
      .set({ isApproved: true })
      .where(eq(reviews.id, id))
      .returning();

    if (!approvedReview[0]) {
      res.status(404).json({ message: 'Отзыв не найден' });
      return;
    }

    res.json(approvedReview[0]);
  } catch (error) {
    next(error);
  }
};

// Отклонить отзыв
export const rejectReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const deletedReview = await db
      .delete(reviews)
      .where(eq(reviews.id, id))
      .returning();

    if (!deletedReview[0]) {
      res.status(404).json({ message: 'Отзыв не найден' });
      return;
    }

    res.json({ message: 'Отзыв отклонён и удалён' });
  } catch (error) {
    next(error);
  }
};

// Удалить отзыв
export const deleteReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const deletedReview = await db
      .delete(reviews)
      .where(eq(reviews.id, id))
      .returning();

    if (!deletedReview[0]) {
      res.status(404).json({ message: 'Отзыв не найден' });
      return;
    }

    res.json(deletedReview[0]);
  } catch (error) {
    next(error);
  }
};
