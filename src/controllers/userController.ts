import { Request, Response, NextFunction } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { users, userFavorites, films, watchHistory } from '../schema';

// Получить всех пользователей
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    res.json(allUsers);
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
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    res.json(user[0]);
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
    const { name, email, avatar } = req.body;

    const newUser = await db
      .insert(users)
      .values({ name, email, avatar })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
      });

    res.status(201).json(newUser[0]);
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
    const { name } = req.body;

    const updatedUser = await db
      .update(users)
      .set({ name })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
      });

    if (!updatedUser[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    res.json(updatedUser[0]);
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

    const favorites = await db
      .select({
        id: films.id,
        name: films.name,
        description: films.description,
        image: films.image,
        releaseDate: films.releaseDate,
        trailerUrl: films.trailerUrl,
        filmUrl: films.filmUrl,
        addedAt: userFavorites.createdAt,
      })
      .from(films)
      .innerJoin(userFavorites, eq(films.id, userFavorites.filmId))
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));

    res.json(favorites);
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
        eq(userFavorites.userId, userId) && eq(userFavorites.filmId, filmId),
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
