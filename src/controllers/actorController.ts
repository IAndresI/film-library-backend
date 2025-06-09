import { Request, Response, NextFunction } from 'express';
import { eq, desc, like, and, count, inArray, ilike } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  actors,
  filmActors,
  films,
  genres,
  filmGenres,
  reviews,
} from '../schema';
import { deleteFile } from '../utils/fileUtils';
import { enrichFilmsWithDetails } from '../utils/filmUtils';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
} from '../utils/queryParser';

// Получить всех видимых актёров
export const getActors = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectFields = {
      id: actors.id,
      name: actors.name,
      image: actors.image,
      birthday: actors.birthday,
      description: actors.description,
      isVisible: actors.isVisible,
      createdAt: actors.createdAt,
    };

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Обработка параметров фильтрации
    const searchQuery = req.query.search;

    // Обработка фильмов - может прийти как 'films[]' или 'films'
    let filmIds: string[] = [];
    if (req.query['films[]']) {
      filmIds = Array.isArray(req.query['films[]'])
        ? (req.query['films[]'] as string[])
        : [req.query['films[]'] as string];
    } else if (req.query.films) {
      filmIds = Array.isArray(req.query.films)
        ? (req.query.films as string[])
        : [req.query.films as string];
    }

    // Базовые условия
    const baseConditions = [eq(actors.isVisible, true)];

    // Поиск по имени актёра
    if (searchQuery && typeof searchQuery === 'string') {
      baseConditions.push(ilike(actors.name, `%${searchQuery}%`));
    }

    // Фильтр по фильмам (актёры, которые снимались в конкретных фильмах)
    if (filmIds.length > 0) {
      const actorIdsInFilms = db
        .selectDistinct({ actorId: filmActors.actorId })
        .from(filmActors)
        .where(inArray(filmActors.filmId, filmIds.map(Number)));

      baseConditions.push(inArray(actors.id, actorIdsInFilms));
    }

    const finalCondition = and(...baseConditions);

    // Запрос данных с пагинацией
    const allActors = await db
      .select(selectFields)
      .from(actors)
      .where(finalCondition)
      .orderBy(orderByClause)
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const totalCountResult = await db
      .select({ count: count() })
      .from(actors)
      .where(finalCondition);
    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: allActors,
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

// Получить всех актёров (для админов)
export const getAllActors = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectFields = {
      id: actors.id,
      name: actors.name,
      image: actors.image,
      birthday: actors.birthday,
      description: actors.description,
      isVisible: actors.isVisible,
      createdAt: actors.createdAt,
    };

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовый запрос
    const baseQuery = db.select(selectFields).from(actors);

    // Запрос данных с пагинацией
    const actorsQuery = whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery;

    const allActors = await actorsQuery
      .orderBy(orderByClause)
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const countQuery = db.select({ count: count() }).from(actors);
    const totalCountResult = whereCondition
      ? await countQuery.where(whereCondition)
      : await countQuery;

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: allActors,
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

// Получить актёра по ID с фильмами (для админов)
export const getActorByIdAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Основная информация об актёре (без проверки isVisible)
    const actor = await db
      .select()
      .from(actors)
      .where(eq(actors.id, id))
      .limit(1);

    if (!actor[0]) {
      res.status(404).json({ message: 'Актёр не найден' });
      return;
    }

    // Фильмы актёра (включая скрытые)
    const actorFilms = await db
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
        role: filmActors.role,
      })
      .from(films)
      .innerJoin(filmActors, eq(films.id, filmActors.filmId))
      .where(eq(filmActors.actorId, id))
      .orderBy(desc(films.releaseDate));

    // Обогащаем данные фильмов жанрами, актёрами и рейтингом
    const enrichedFilms = await enrichFilmsWithDetails(actorFilms);

    const result = {
      ...actor[0],
      films: enrichedFilms,
    };

    res.json(result);
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
        description: films.description,
        image: films.image,
        releaseDate: films.releaseDate,
        trailerUrl: films.trailerUrl,
        filmUrl: films.filmUrl,
        createdAt: films.createdAt,
        isVisible: films.isVisible,
        role: filmActors.role,
      })
      .from(films)
      .innerJoin(filmActors, eq(films.id, filmActors.filmId))
      .where(and(eq(filmActors.actorId, id), eq(films.isVisible, true)))
      .orderBy(desc(films.releaseDate));

    // Обогащаем данные фильмов жанрами, актёрами и рейтингом
    const enrichedFilms = await enrichFilmsWithDetails(actorFilms);

    const result = {
      ...actor[0],
      films: enrichedFilms,
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
        isVisible: isVisible === 'true',
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

    // Обработка изображения
    let image = req.body.image;

    if (req.file) {
      // Загружен новый файл - удаляем старое изображение и сохраняем новое
      if (existingActor[0].image) {
        deleteFile(existingActor[0].image);
      }
      image = `/${req.file.path.replace(/\\/g, '/')}`;
    } else if (image === 'null') {
      // Если передано "null", удаляем текущее изображение
      if (existingActor[0].image) {
        deleteFile(existingActor[0].image);
      }
      image = null;
    } else if (image === undefined) {
      // Если поле не передано, оставляем текущее значение
      image = existingActor[0].image;
    }

    const updatedActor = await db
      .update(actors)
      .set({
        name,
        image,
        birthday,
        description,
        isVisible: isVisible === 'true',
      })
      .where(eq(actors.id, id))
      .returning();

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

    // Получаем данные актёра перед удалением для удаления медиа файлов
    const actorToDelete = await db
      .select()
      .from(actors)
      .where(eq(actors.id, id))
      .limit(1);

    if (!actorToDelete[0]) {
      res.status(404).json({ message: 'Актёр не найден' });
      return;
    }

    // Удаляем изображение актёра
    if (actorToDelete[0].image) {
      deleteFile(actorToDelete[0].image);
    }

    const deletedActor = await db
      .delete(actors)
      .where(eq(actors.id, id))
      .returning();

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
    const selectFields = {
      id: actors.id,
      name: actors.name,
      image: actors.image,
      birthday: actors.birthday,
      description: actors.description,
      isVisible: actors.isVisible,
      createdAt: actors.createdAt,
    };

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовые условия: видимые актёры + поиск по имени если указан
    const baseConditions = [eq(actors.isVisible, true)];

    const { query } = req.query;
    if (query && typeof query === 'string') {
      baseConditions.push(like(actors.name, `%${query}%`));
    }

    const baseCondition = and(...baseConditions);

    // Комбинируем с дополнительными фильтрами
    const finalCondition = whereCondition
      ? and(baseCondition, whereCondition)
      : baseCondition;

    // Базовый запрос
    const baseQuery = db.select(selectFields).from(actors);

    // Запрос данных с пагинацией
    const searchResults = await baseQuery
      .where(finalCondition)
      .orderBy(orderByClause)
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const totalCountResult = await db
      .select({ count: count() })
      .from(actors)
      .where(finalCondition);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    res.json({
      data: searchResults,
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
