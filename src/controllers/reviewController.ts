import { Request, Response, NextFunction } from 'express';
import { eq, desc, and, count } from 'drizzle-orm';
import { db } from '../db/connection';
import { reviews, users, films } from '../schema';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
} from '../utils/queryParser';

// Общий селект объект для всех запросов
const getSelectFields = () => ({
  id: reviews.id,
  rating: reviews.rating,
  text: reviews.text,
  isApproved: reviews.isApproved,
  createdAt: reviews.createdAt,
  // Полная информация о пользователе
  userId: users.id,
  userName: users.name,
  userEmail: users.email,
  userAvatar: users.avatar,
  userIsAdmin: users.isAdmin,
  userCreatedAt: users.createdAt,
  // Полная информация о фильме
  filmId: films.id,
  filmName: films.name,
  filmDescription: films.description,
  filmImage: films.image,
  filmReleaseDate: films.releaseDate,
  filmCreatedAt: films.createdAt,
  filmTrailerUrl: films.trailerUrl,
  filmUrl: films.filmUrl,
  filmIsVisible: films.isVisible,
});

// Общая функция для маппинга результатов
const mapReviewsData = (reviewsData: any[]) =>
  reviewsData.map((review) => ({
    id: review.id,
    rating: review.rating,
    text: review.text,
    isApproved: review.isApproved,
    createdAt: review.createdAt,
    user: {
      id: review.userId,
      name: review.userName,
      email: review.userEmail,
      avatar: review.userAvatar,
      isAdmin: review.userIsAdmin,
      createdAt: review.userCreatedAt,
    },
    film: {
      id: review.filmId,
      name: review.filmName,
      description: review.filmDescription,
      image: review.filmImage,
      releaseDate: review.filmReleaseDate,
      createdAt: review.filmCreatedAt,
      trailerUrl: review.filmTrailerUrl,
      filmUrl: review.filmUrl,
      isVisible: review.filmIsVisible,
    },
  }));

// Получить все одобренные отзывы для фильма
export const getApprovedReviews = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filmId = parseInt(req.params.filmId, 10);
    const selectFields = getSelectFields();

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовые условия: фильм и одобренные отзывы
    const baseConditions = and(
      eq(reviews.filmId, filmId),
      eq(reviews.isApproved, true),
    );

    // Комбинируем с дополнительными фильтрами
    const finalCondition = whereCondition
      ? and(baseConditions, whereCondition)
      : baseConditions;

    // Запрос данных с пагинацией
    const reviewsData = await db
      .select(selectFields)
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id))
      .where(finalCondition)
      .orderBy(orderByClause)
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const totalCountResult = await db
      .select({ count: count() })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id))
      .where(finalCondition);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapReviewsData(reviewsData),
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

// Получить все отзывы (для админов)
export const getAllReviews = async (
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

    // Базовый запрос
    const baseQuery = db
      .select(selectFields)
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id));

    // Запрос данных с пагинацией
    const reviewsQuery = whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery;

    const reviewsData = await reviewsQuery
      .orderBy(orderByClause)
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const countQuery = db
      .select({ count: count() })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id));

    const totalCountResult = whereCondition
      ? await countQuery.where(whereCondition)
      : await countQuery;

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapReviewsData(reviewsData),
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

// Получить неодобренные отзывы (для модерации)
export const getPendingReviews = async (
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

    // Базовое условие: неодобренные отзывы
    const baseCondition = eq(reviews.isApproved, false);

    // Комбинируем с дополнительными фильтрами
    const finalCondition = whereCondition
      ? and(baseCondition, whereCondition)
      : baseCondition;

    // Запрос данных с пагинацией
    const reviewsData = await db
      .select(selectFields)
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id))
      .where(finalCondition)
      .orderBy(orderByClause)
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const totalCountResult = await db
      .select({ count: count() })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(films, eq(reviews.filmId, films.id))
      .where(finalCondition);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: mapReviewsData(reviewsData),
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

    const rejectedReview = await db
      .update(reviews)
      .set({ isApproved: false })
      .where(eq(reviews.id, id))
      .returning();

    if (!rejectedReview[0]) {
      res.status(404).json({ message: 'Отзыв не найден' });
      return;
    }

    res.json({ message: 'Отзыв отклонён', review: rejectedReview[0] });
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
