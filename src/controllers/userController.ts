import { Request, Response, NextFunction } from 'express';
import { eq, desc, and, count, inArray, ilike, avg, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  users,
  userFavorites,
  films,
  watchHistory,
  filmGenres,
  filmActors,
  reviews,
} from '../schema';
import { deleteFile } from '../utils/fileUtils';
import { paymentService } from '../services/paymentService';
import { enrichFilmsWithDetails } from '../utils/filmUtils';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
  parseArrayParam,
} from '../utils/queryParser';

// Получить всех пользователей
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectFields = {
      id: users.id,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      createdAt: users.createdAt,
      isAdmin: users.isAdmin,
    };

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовый запрос
    const baseQuery = db.select(selectFields).from(users);

    // Запрос данных с пагинацией
    const usersQuery = whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery;

    const allUsers = await usersQuery
      .orderBy(orderByClause)
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const countQuery = db.select({ count: count() }).from(users);
    const totalCountResult = whereCondition
      ? await countQuery.where(whereCondition)
      : await countQuery;

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    // Добавляем подписку для каждого пользователя
    const usersWithSubscriptions = await Promise.all(
      allUsers.map(async (user) => {
        const subscription = await paymentService.getUserSubscription(user.id);
        return {
          ...user,
          subscription: subscription || null,
        };
      }),
    );

    res.json({
      data: usersWithSubscriptions,
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

// Получить пользователя по ID
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const user = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    // Получаем подписку пользователя
    const subscription = await paymentService.getUserSubscription(user[0].id);

    res.json({
      ...user[0],
      subscription: subscription || null,
    });
  } catch (error) {
    next(error);
  }
};

// Создать пользователя
export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, email } = req.body;

    // Получаем путь к загруженному аватару
    let avatar = req.body.avatar; // URL из поля формы если есть
    if (req.file) {
      avatar = `/${req.file.path.replace(/\\/g, '/')}`;
    }

    const newUser = await db
      .insert(users)
      .values({ name, email, avatar })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      });

    // Получаем подписку нового пользователя (будет null)
    const subscription = await paymentService.getUserSubscription(
      newUser[0].id,
    );

    res.status(201).json({
      ...newUser[0],
      subscription: subscription || null,
    });
  } catch (error) {
    next(error);
  }
};

// Редактировать пользователя
export const editUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, isAdmin } = req.body;

    // Получаем старые данные
    const existingUser = await db
      .select({ avatar: users.avatar })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existingUser[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    // Готовим объект для обновления
    const updateData: {
      name: string;
      avatar?: string | null;
      isAdmin?: boolean;
    } = {
      name,
    };

    if (isAdmin) {
      updateData.isAdmin = isAdmin === 'true';
    }

    // Обрабатываем аватар
    if (req.file) {
      // Если передан новый файл - загружаем его
      if (existingUser[0].avatar) {
        deleteFile(existingUser[0].avatar);
      }
      updateData.avatar = `/${req.file.path.replace(/\\/g, '/')}`;
    } else if (req.body.avatar === 'null') {
      // Если передана строка "null" - удаляем текущий аватар
      if (existingUser[0].avatar) {
        deleteFile(existingUser[0].avatar);
      }
      updateData.avatar = null;
    } else if (req.body.avatar) {
      // Если передан URL - устанавливаем его
      updateData.avatar = req.body.avatar;
    }
    // Если поле avatar не передано вообще - не трогаем текущий аватар

    const updatedUser = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      });

    // Получаем подписку обновленного пользователя
    const subscription = await paymentService.getUserSubscription(
      updatedUser[0].id,
    );

    res.json({
      ...updatedUser[0],
      subscription: subscription || null,
    });
  } catch (error) {
    next(error);
  }
};

// Получить избранные фильмы пользователя
export const getUserFavorites = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Парсинг параметров пагинации
    const pagination = parsePaginationParams(req);

    // Обработка параметров запроса
    const searchQuery = req.query.search || req.query.query;

    // Обработка жанров
    const genreIds = parseArrayParam(req.query.genres);

    // Обработка актёров
    const actorIds = parseArrayParam(req.query.actors);

    // Определяем поля для сортировки
    const selectFields = {
      id: films.id,
      name: films.name,
      description: films.description,
      image: films.image,
      releaseDate: films.releaseDate,
      trailerUrl: films.trailerUrl,
      filmUrl: films.filmUrl,
      createdAt: userFavorites.createdAt,
      isVisible: films.isVisible,
      addedAt: userFavorites.createdAt,
    };

    // Проверяем сортировку
    const sort = req.query.sort as any;
    let ratingSort: { desc: boolean } | null = null;
    let reviewCountSort: { desc: boolean } | null = null;
    let orderByClause = null;

    if (sort && Array.isArray(sort) && sort.length > 0) {
      const firstSort = sort[0];
      if (firstSort && firstSort.id === 'rating') {
        ratingSort = { desc: firstSort.desc === 'true' };
      } else if (firstSort && firstSort.id === 'reviewCount') {
        reviewCountSort = { desc: firstSort.desc === 'true' };
      } else {
        // Обычная сортировка через parseSortParams
        orderByClause = parseSortParams(req, selectFields);
      }
    } else {
      // Сортировка по умолчанию
      orderByClause = desc(userFavorites.createdAt);
    }

    // Базовые условия
    const baseConditions = [eq(userFavorites.userId, userId)];

    // Поиск по названию фильма
    if (searchQuery && typeof searchQuery === 'string') {
      baseConditions.push(ilike(films.name, `%${searchQuery}%`));
    }

    // Создаем запрос в зависимости от сортировки
    let baseQuery;

    if (ratingSort || reviewCountSort) {
      // Запрос с reviews для сортировки по рейтингу/количеству оценок
      baseQuery = db
        .select({
          id: films.id,
          name: films.name,
          description: films.description,
          image: films.image,
          releaseDate: films.releaseDate,
          trailerUrl: films.trailerUrl,
          filmUrl: films.filmUrl,
          createdAt: films.createdAt,
          isVisible: films.isVisible,
          addedAt: userFavorites.createdAt,
          avgRating: avg(reviews.rating),
          reviewCount: count(reviews.id),
        })
        .from(films)
        .innerJoin(userFavorites, eq(films.id, userFavorites.filmId))
        .leftJoin(
          reviews,
          and(eq(films.id, reviews.filmId), eq(reviews.isApproved, true)),
        );
    } else {
      // Обычный запрос без reviews
      baseQuery = db
        .select({
          id: films.id,
          name: films.name,
          description: films.description,
          image: films.image,
          releaseDate: films.releaseDate,
          trailerUrl: films.trailerUrl,
          filmUrl: films.filmUrl,
          createdAt: films.createdAt,
          isVisible: films.isVisible,
          addedAt: userFavorites.createdAt,
        })
        .from(films)
        .innerJoin(userFavorites, eq(films.id, userFavorites.filmId));
    }

    // Фильтр по жанрам
    if (genreIds.length > 0) {
      baseQuery = baseQuery.innerJoin(
        filmGenres,
        eq(films.id, filmGenres.filmId),
      );
      baseConditions.push(inArray(filmGenres.genreId, genreIds.map(Number)));
    }

    // Фильтр по актёрам
    if (actorIds.length > 0) {
      baseQuery = baseQuery.innerJoin(
        filmActors,
        eq(films.id, filmActors.filmId),
      );
      baseConditions.push(inArray(filmActors.actorId, actorIds.map(Number)));
    }

    const finalCondition = and(...baseConditions);

    // Выполняем запрос в зависимости от типа сортировки
    let favorites: any[] = [];

    if (ratingSort || reviewCountSort) {
      // Запрос с группировкой и сортировкой по рейтингу/количеству оценок
      const queryWithWhere = baseQuery.where(finalCondition);
      const queryWithGroup = queryWithWhere.groupBy(
        films.id,
        userFavorites.createdAt,
      );

      if (ratingSort) {
        // Сортировка по рейтингу (фильмы без рейтинга всегда внизу)
        if (ratingSort.desc) {
          favorites = await queryWithGroup
            .orderBy(
              sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
              desc(avg(reviews.rating)),
            )
            .limit(pagination.limit)
            .offset(pagination.offset);
        } else {
          favorites = await queryWithGroup
            .orderBy(
              sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
              avg(reviews.rating),
            )
            .limit(pagination.limit)
            .offset(pagination.offset);
        }
      } else if (reviewCountSort) {
        // Сортировка по количеству оценок
        favorites = await queryWithGroup
          .orderBy(
            reviewCountSort.desc ? desc(count(reviews.id)) : count(reviews.id),
          )
          .limit(pagination.limit)
          .offset(pagination.offset);
      }
    } else {
      // Обычный запрос с обычными сортировками
      favorites = await baseQuery
        .where(finalCondition)
        .orderBy(orderByClause || desc(userFavorites.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset);
    }

    // Запрос общего количества
    let countQuery = db
      .select({ count: count() })
      .from(films)
      .innerJoin(userFavorites, eq(films.id, userFavorites.filmId));

    // Добавляем JOIN для фильтров если они есть
    if (genreIds.length > 0) {
      countQuery = countQuery.innerJoin(
        filmGenres,
        eq(films.id, filmGenres.filmId),
      );
    }

    if (actorIds.length > 0) {
      countQuery = countQuery.innerJoin(
        filmActors,
        eq(films.id, filmActors.filmId),
      );
    }

    const totalCountResult = await countQuery.where(finalCondition);
    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    // Обогащаем данные жанрами, актёрами и рейтингом
    const favoritesWithDetails = await enrichFilmsWithDetails(favorites);

    res.json({
      data: favoritesWithDetails,
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

// Получить только ID избранных фильмов пользователя
export const getUserFavoriteIds = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const favoriteIds = await db
      .select({
        filmId: userFavorites.filmId,
      })
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));

    const ids = favoriteIds.map((f) => f.filmId);

    res.json(ids);
  } catch (error) {
    next(error);
  }
};

// Добавить фильм в избранное
export const addToFavorites = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { filmId } = req.body;

    const newFavorite = await db
      .insert(userFavorites)
      .values({ userId, filmId })
      .returning();

    res.status(201).json(newFavorite[0]);
  } catch (error) {
    next(error);
  }
};

// Проверить, находится ли фильм в избранном у пользователя
export const checkFavoriteStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const filmId = parseInt(req.params.filmId, 10);

    const favorite = await db
      .select()
      .from(userFavorites)
      .where(
        and(eq(userFavorites.userId, userId), eq(userFavorites.filmId, filmId)),
      )
      .limit(1);

    res.json({
      isFavorite: !!favorite[0],
      filmId,
      userId,
    });
  } catch (error) {
    next(error);
  }
};

// Удалить из избранного
export const removeFromFavorites = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const filmId = parseInt(req.params.filmId, 10);

    const deleted = await db
      .delete(userFavorites)
      .where(
        and(eq(userFavorites.userId, userId), eq(userFavorites.filmId, filmId)),
      )
      .returning();

    if (!deleted[0]) {
      res.status(404).json({ message: 'Запись не найдена' });
      return;
    }

    res.json({ message: 'Удалено из избранного' });
  } catch (error) {
    next(error);
  }
};

// Получить историю просмотров пользователя
export const getUserWatchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const history = await db
      .select({
        id: watchHistory.id,
        filmId: films.id,
        filmName: films.name,
        filmImage: films.image,
        progress: watchHistory.progress,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .innerJoin(films, eq(watchHistory.filmId, films.id))
      .where(eq(watchHistory.userId, userId))
      .orderBy(desc(watchHistory.watchedAt));

    res.json(history);
  } catch (error) {
    next(error);
  }
};

// Удалить пользователя
export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Получаем данные пользователя перед удалением для удаления медиа файлов
    const userToDelete = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!userToDelete[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    // Удаляем аватар пользователя
    if (userToDelete[0].avatar) {
      deleteFile(userToDelete[0].avatar);
    }

    const deletedUser = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    res.json(deletedUser[0]);
  } catch (error) {
    next(error);
  }
};
