import { Request, Response, NextFunction } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { genres } from '../schema';

// Получить все жанры
export const getGenres = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allGenres = await db.select().from(genres).orderBy(genres.name);

    res.json(allGenres);
  } catch (error) {
    next(error);
  }
};

// Получить жанр по ID
export const getGenreById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const genre = await db
      .select()
      .from(genres)
      .where(eq(genres.id, id))
      .limit(1);

    if (!genre[0]) {
      res.status(404).json({ message: 'Жанр не найден' });
      return;
    }

    res.json(genre[0]);
  } catch (error) {
    next(error);
  }
};

// Создать новый жанр
export const createGenre = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, icon } = req.body;

    const newGenre = await db.insert(genres).values({ name, icon }).returning();

    res.status(201).json(newGenre[0]);
  } catch (error) {
    next(error);
  }
};

// Обновить жанр
export const updateGenre = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, icon } = req.body;

    const updatedGenre = await db
      .update(genres)
      .set({ name, icon })
      .where(eq(genres.id, id))
      .returning();

    if (!updatedGenre[0]) {
      res.status(404).json({ message: 'Жанр не найден' });
      return;
    }

    res.json(updatedGenre[0]);
  } catch (error) {
    next(error);
  }
};

// Удалить жанр
export const deleteGenre = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const deletedGenre = await db
      .delete(genres)
      .where(eq(genres.id, id))
      .returning();

    if (!deletedGenre[0]) {
      res.status(404).json({ message: 'Жанр не найден' });
      return;
    }

    res.json(deletedGenre[0]);
  } catch (error) {
    next(error);
  }
};
