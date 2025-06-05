import { Request, Response, NextFunction } from 'express';
import { eq, desc, like } from 'drizzle-orm';
import { db } from '../db/connection';
import { actors, filmActors, films } from '../schema';
import { deleteFile } from '../utils/fileUtils';

// Получить всех видимых актёров
export const getActors = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allActors = await db
      .select({
        id: actors.id,
        name: actors.name,
        image: actors.image,
        birthday: actors.birthday,
        description: actors.description,
        isVisible: actors.isVisible,
      })
      .from(actors)
      .where(eq(actors.isVisible, true))
      .orderBy(desc(actors.id));

    res.json(allActors);
  } catch (error) {
    next(error);
  }
};

// Получить всех актёров (для админов)
export const getAllActors = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allActors = await db
      .select({
        id: actors.id,
        name: actors.name,
        image: actors.image,
        birthday: actors.birthday,
        description: actors.description,
        isVisible: actors.isVisible,
      })
      .from(actors)
      .orderBy(desc(actors.id));

    res.json(allActors);
  } catch (error) {
    next(error);
  }
};

// Получить актёра по ID с фильмами
export const getActorById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Основная информация об актёре
    const actor = await db
      .select()
      .from(actors)
      .where(eq(actors.id, id))
      .limit(1);

    if (!actor[0]) {
      res.status(404).json({ message: 'Актёр не найден' });
      return;
    }

    // Проверяем видимость актёра для обычных пользователей
    if (!actor[0].isVisible) {
      res.status(404).json({ message: 'Актёр не найден' });
      return;
    }

    // Фильмы актёра (только видимые)
    const actorFilms = await db
      .select({
        id: films.id,
        name: films.name,
        image: films.image,
        releaseDate: films.releaseDate,
        role: filmActors.role,
      })
      .from(films)
      .innerJoin(filmActors, eq(films.id, filmActors.filmId))
      .where(eq(filmActors.actorId, id) && eq(films.isVisible, true))
      .orderBy(desc(films.releaseDate));

    const result = {
      ...actor[0],
      films: actorFilms,
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Создать актёра
export const createActor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, birthday, description, isVisible } = req.body;

    // Получаем путь к загруженному изображению
    let image = req.body.image; // URL из поля формы если есть
    if (req.file) {
      image = `/${req.file.path.replace(/\\/g, '/')}`;
    }

    const newActor = await db
      .insert(actors)
      .values({
        name,
        image,
        birthday,
        description,
        isVisible: isVisible ?? true,
      })
      .returning();

    res.status(201).json(newActor[0]);
  } catch (error) {
    next(error);
  }
};

// Обновить актёра
export const updateActor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, birthday, description, isVisible } = req.body;

    // Получаем старые данные
    const existingActor = await db
      .select({ image: actors.image })
      .from(actors)
      .where(eq(actors.id, id))
      .limit(1);

    if (!existingActor[0]) {
      res.status(404).json({ message: 'Актёр не найден' });
      return;
    }

    // Получаем путь к загруженному изображению
    let image = req.body.image; // URL из поля формы если есть
    if (req.file) {
      image = `/${req.file.path.replace(/\\/g, '/')}`;
    }

    const updatedActor = await db
      .update(actors)
      .set({
        name,
        image,
        birthday,
        description,
        isVisible,
      })
      .where(eq(actors.id, id))
      .returning();

    // Удаляем старое изображение если загружалось новое
    if (req.file && existingActor[0].image) {
      deleteFile(existingActor[0].image);
    }

    res.json(updatedActor[0]);
  } catch (error) {
    next(error);
  }
};

// Удалить актёра
export const deleteActor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const deletedActor = await db
      .delete(actors)
      .where(eq(actors.id, id))
      .returning();

    if (!deletedActor[0]) {
      res.status(404).json({ message: 'Актёр не найден' });
      return;
    }

    res.json(deletedActor[0]);
  } catch (error) {
    next(error);
  }
};

// Поиск актёров (только видимые)
export const searchActors = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ message: 'Параметр поиска обязателен' });
      return;
    }

    const searchResults = await db
      .select()
      .from(actors)
      .where(like(actors.name, `%${query}%`) && eq(actors.isVisible, true))
      .orderBy(desc(actors.id));

    res.json(searchResults);
  } catch (error) {
    next(error);
  }
};

// Скрыть/показать актёра (только для админов)
export const toggleActorVisibility = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const actor = await db
      .select()
      .from(actors)
      .where(eq(actors.id, id))
      .limit(1);

    if (!actor[0]) {
      res.status(404).json({ message: 'Актёр не найден' });
      return;
    }

    const updatedActor = await db
      .update(actors)
      .set({ isVisible: !actor[0].isVisible })
      .where(eq(actors.id, id))
      .returning();

    res.json(updatedActor[0]);
  } catch (error) {
    next(error);
  }
};
