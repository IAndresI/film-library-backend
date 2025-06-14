import { Request, Response, NextFunction } from 'express';
import {
  eq,
  desc,
  like,
  avg,
  and,
  count,
  inArray,
  ilike,
  sql,
} from 'drizzle-orm';
import { db } from '../db/connection';
import {
  films,
  genres,
  actors,
  filmGenres,
  filmActors,
  reviews,
  users,
  userPurchasedFilms,
} from '../schema';
import { deleteFile } from '../utils/fileUtils';
import {
  getFilmRating,
  enrichFilmsWithDetails,
  getFilmSelectFields,
  enrichFilmsWithAccess,
} from '../utils/filmUtils';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
  parseArrayParam,
} from '../utils/queryParser';

// Получить все видимые фильмы
export const getFilms = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectFields = getFilmSelectFields();

    // Получаем userId из middleware (если пользователь авторизован)
    const userId = req.user.userId;

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Обработка параметров фильтрации
    const searchQuery = req.query.search || req.query.query;

    // Обработка жанров
    const genreIds = parseArrayParam(req.query.genres);

    // Обработка актёров
    const actorIds = parseArrayParam(req.query.actors);

    // Базовые условия
    const baseConditions = [eq(films.isVisible, true)];

    // Поиск по названию фильма
    if (searchQuery && typeof searchQuery === 'string') {
      baseConditions.push(ilike(films.name, `%${searchQuery}%`));
    }

    // Фильтр по жанрам
    if (genreIds.length > 0) {
      const filmIdsWithGenres = db
        .selectDistinct({ filmId: filmGenres.filmId })
        .from(filmGenres)
        .where(inArray(filmGenres.genreId, genreIds.map(Number)));

      baseConditions.push(inArray(films.id, filmIdsWithGenres));
    }

    // Фильтр по актёрам
    if (actorIds.length > 0) {
      const filmIdsWithActors = db
        .selectDistinct({ filmId: filmActors.filmId })
        .from(filmActors)
        .where(inArray(filmActors.actorId, actorIds.map(Number)));

      baseConditions.push(inArray(films.id, filmIdsWithActors));
    }

    // Проверяем сортировку по рейтингу или количеству оценок
    const sort = req.query.sort as any;
    let ratingSort: { desc: boolean } | null = null;
    let reviewCountSort: { desc: boolean } | null = null;

    if (sort && Array.isArray(sort) && sort.length > 0) {
      const firstSort = sort[0];
      if (firstSort && firstSort.id === 'rating') {
        ratingSort = { desc: firstSort.desc === 'true' };
      } else if (firstSort && firstSort.id === 'reviewCount') {
        reviewCountSort = { desc: firstSort.desc === 'true' };
      }
    }

    const finalCondition = and(...baseConditions);

    // Базовый запрос
    let baseQuery;

    if (ratingSort || reviewCountSort) {
      // Если сортировка по рейтингу или количеству оценок
      baseQuery = db
        .select({
          ...selectFields,
          avgRating: avg(reviews.rating),
          reviewCount: count(reviews.id),
        })
        .from(films)
        .leftJoin(
          reviews,
          and(eq(films.id, reviews.filmId), eq(reviews.isApproved, true)),
        )
        .where(finalCondition)
        .groupBy(films.id);
    } else {
      // Обычный запрос без JOIN
      baseQuery = db.select(selectFields).from(films).where(finalCondition);
    }

    // Запрос данных с пагинацией
    let queryWithOrder;
    if (ratingSort) {
      // Сортировка по рейтингу (фильмы без рейтинга всегда внизу)
      if (ratingSort.desc) {
        queryWithOrder = baseQuery.orderBy(
          sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
          desc(avg(reviews.rating)),
        );
      } else {
        queryWithOrder = baseQuery.orderBy(
          sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
          avg(reviews.rating),
        );
      }
    } else if (reviewCountSort) {
      // Сортировка по количеству оценок
      queryWithOrder = reviewCountSort.desc
        ? baseQuery.orderBy(desc(count(reviews.id)))
        : baseQuery.orderBy(count(reviews.id));
    } else if (orderByClause) {
      queryWithOrder = baseQuery.orderBy(orderByClause);
    } else {
      queryWithOrder = baseQuery.orderBy(desc(films.createdAt));
    }

    const allFilms = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const totalCountResult = await db
      .select({ count: count() })
      .from(films)
      .where(finalCondition);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    // Обогащаем данные жанрами, актёрами, рейтингом и доступом
    const filmsWithDetails = await enrichFilmsWithDetails(allFilms, userId);

    res.json({
      data: filmsWithDetails,
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

// Получить фильм по ID (для админов, включая скрытые)
export const getFilmByIdAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Основная информация о фильме (без проверки isVisible)
    const film = await db.select().from(films).where(eq(films.id, id)).limit(1);

    if (!film[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

    // Жанры фильма
    const filmGenresList = await db
      .select({
        id: genres.id,
        name: genres.name,
        icon: genres.icon,
      })
      .from(genres)
      .innerJoin(filmGenres, eq(genres.id, filmGenres.genreId))
      .where(eq(filmGenres.filmId, id));

    // Актёры фильма (включая скрытых)
    const filmActorsList = await db
      .select({
        id: actors.id,
        name: actors.name,
        image: actors.image,
        birthday: actors.birthday,
        description: actors.description,
        role: filmActors.role,
        createdAt: actors.createdAt,
      })
      .from(actors)
      .innerJoin(filmActors, eq(actors.id, filmActors.actorId))
      .where(eq(filmActors.filmId, id));

    // Рейтинг фильма
    const rating = await getFilmRating(id);

    const result = {
      ...film[0],
      genres: filmGenresList,
      actors: filmActorsList,
      rating,
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Получить все фильмы (для админов)
export const getAllFilms = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectFields = getFilmSelectFields();

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Обработка фильтров по жанрам и сортировки по рейтингу из новой структуры
    const filters = req.query.filters as any;
    const sort = req.query.sort as any;
    let genreFilters: number[] = [];
    let ratingSort: { desc: boolean } | null = null;

    if (filters && Array.isArray(filters)) {
      filters.forEach((filter: any) => {
        if (filter.id === 'genres' && filter.value) {
          const values = Array.isArray(filter.value)
            ? filter.value
            : [filter.value];
          genreFilters = values.map((v: string) => parseInt(v, 10));
        }
      });
    }

    // Проверяем сортировку по рейтингу
    if (sort && Array.isArray(sort) && sort.length > 0) {
      const firstSort = sort[0];
      if (firstSort && firstSort.id === 'rating') {
        ratingSort = { desc: firstSort.desc === 'true' };
      }
    }

    // Базовый запрос
    let baseQuery;
    let finalWhereCondition = whereCondition;

    if (genreFilters.length > 0 && ratingSort) {
      // Если есть и фильтры по жанрам, и сортировка по рейтингу
      baseQuery = db
        .select({
          ...selectFields,
          avgRating: avg(reviews.rating),
        })
        .from(films)
        .innerJoin(filmGenres, eq(films.id, filmGenres.filmId))
        .leftJoin(
          reviews,
          and(eq(films.id, reviews.filmId), eq(reviews.isApproved, true)),
        )
        .groupBy(films.id, filmGenres.genreId);

      const genreCondition = inArray(filmGenres.genreId, genreFilters);
      finalWhereCondition = whereCondition
        ? and(genreCondition, whereCondition)
        : genreCondition;
    } else if (genreFilters.length > 0) {
      // Только фильтры по жанрам
      baseQuery = db
        .select(selectFields)
        .from(films)
        .innerJoin(filmGenres, eq(films.id, filmGenres.filmId));

      const genreCondition = inArray(filmGenres.genreId, genreFilters);
      finalWhereCondition = whereCondition
        ? and(genreCondition, whereCondition)
        : genreCondition;
    } else if (ratingSort) {
      // Только сортировка по рейтингу
      baseQuery = db
        .select({
          ...selectFields,
          avgRating: avg(reviews.rating),
        })
        .from(films)
        .leftJoin(
          reviews,
          and(eq(films.id, reviews.filmId), eq(reviews.isApproved, true)),
        )
        .groupBy(films.id);
    } else {
      // Обычный запрос без JOIN
      baseQuery = db.select(selectFields).from(films);
    }

    // Запрос данных с пагинацией
    const filmsQuery = finalWhereCondition
      ? baseQuery.where(finalWhereCondition)
      : baseQuery;

    let queryWithOrder;
    if (ratingSort) {
      // Сортировка по рейтингу (фильмы без рейтинга всегда внизу)
      const { sql } = await import('drizzle-orm');

      if (ratingSort.desc) {
        queryWithOrder = filmsQuery.orderBy(
          sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
          desc(avg(reviews.rating)),
        );
      } else {
        queryWithOrder = filmsQuery.orderBy(
          sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
          avg(reviews.rating),
        );
      }
    } else if (orderByClause) {
      queryWithOrder = filmsQuery.orderBy(orderByClause);
    } else {
      queryWithOrder = filmsQuery.orderBy(desc(films.createdAt));
    }

    const allFilms = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    let countQuery;
    if (genreFilters.length > 0) {
      countQuery = db
        .select({ count: count() })
        .from(films)
        .innerJoin(filmGenres, eq(films.id, filmGenres.filmId));
    } else {
      countQuery = db.select({ count: count() }).from(films);
    }

    const totalCountResult = finalWhereCondition
      ? await countQuery.where(finalWhereCondition)
      : await countQuery;

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    // Обогащаем данные жанрами, актёрами и рейтингом
    const filmsWithDetails = await enrichFilmsWithDetails(allFilms);

    res.json({
      data: filmsWithDetails,
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

// Получить фильм по ID с полной информацией
export const getFilmById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Получаем userId из middleware (если пользователь авторизован)
    const userId = req.user.userId;

    // Основная информация о фильме
    const film = await db.select().from(films).where(eq(films.id, id)).limit(1);

    if (!film[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

    // Проверяем видимость фильма для обычных пользователей
    if (!film[0].isVisible) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

    // Жанры фильма
    const filmGenresList = await db
      .select({
        id: genres.id,
        name: genres.name,
        icon: genres.icon,
      })
      .from(genres)
      .innerJoin(filmGenres, eq(genres.id, filmGenres.genreId))
      .where(eq(filmGenres.filmId, id));

    // Актёры фильма (только видимые)
    const filmActorsList = await db
      .select({
        id: actors.id,
        name: actors.name,
        image: actors.image,
        birthday: actors.birthday,
        description: actors.description,
        role: filmActors.role,
        createdAt: actors.createdAt,
      })
      .from(actors)
      .innerJoin(filmActors, eq(actors.id, filmActors.actorId))
      .where(and(eq(filmActors.filmId, id), eq(actors.isVisible, true)));

    // Рейтинг фильма
    const rating = await getFilmRating(id);

    // Базовый результат
    const baseResult = {
      ...film[0],
      genres: filmGenresList,
      actors: filmActorsList,
      rating,
    };

    // Добавляем информацию о доступе
    const [resultWithAccess] = await enrichFilmsWithAccess(
      [baseResult],
      userId,
    );

    res.json(resultWithAccess);
  } catch (error) {
    next(error);
  }
};

// Создать новый фильм
export const createFilm = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      name,
      description,
      releaseDate,
      trailerUrl,
      filmUrl,
      isVisible,
      isPaid,
      price,
      genres,
      actors,
    } = req.body;

    // Получаем путь к загруженному изображению
    let image = req.body.image; // URL из поля формы если есть
    if (req.file) {
      image = `/${req.file.path.replace(/\\/g, '/')}`;
    }

    const newFilm = await db
      .insert(films)
      .values({
        name,
        description,
        image,
        releaseDate,
        trailerUrl,
        filmUrl,
        isVisible: isVisible === 'true',
        isPaid: isPaid === 'true',
        price: price === 'null' ? null : price || '0.00',
      })
      .returning();

    const filmId = newFilm[0].id;

    // Добавляем жанры фильма (если переданы)
    if (genres && Array.isArray(genres) && genres.length > 0) {
      await db.insert(filmGenres).values(
        genres.map((genreId: number) => ({
          filmId,
          genreId,
        })),
      );
    }

    // Добавляем актёров фильма (если переданы)
    if (actors && Array.isArray(actors) && actors.length > 0) {
      await db.insert(filmActors).values(
        actors.map((actor: { id: number; role?: string }) => ({
          filmId,
          actorId: actor.id,
          role: actor.role || null,
        })),
      );
    }

    res.status(201).json(newFilm[0]);
  } catch (error) {
    next(error);
  }
};

// Обновить данные фильма (без медиа)
export const updateFilmData = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      name,
      description,
      releaseDate,
      isVisible,
      isPaid,
      price,
      genres,
      actors,
    } = req.body;

    // Проверяем существование фильма
    const existingFilm = await db
      .select()
      .from(films)
      .where(eq(films.id, id))
      .limit(1);

    if (!existingFilm[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

    // Получаем путь к загруженному изображению
    let image = req.body.image; // URL из поля формы если есть
    if (req.file) {
      // Удаляем старое изображение если загружается новое
      if (existingFilm[0].image) {
        deleteFile(existingFilm[0].image);
      }
      image = `/${req.file.path.replace(/\\/g, '/')}`;
    }

    // Обновляем основные данные фильма
    const updatedFilm = await db
      .update(films)
      .set({
        name,
        description,
        image,
        releaseDate,
        isVisible: isVisible === 'true',
        isPaid: isPaid === 'true',
        price: price === 'null' ? null : price || '0.00',
      })
      .where(eq(films.id, id))
      .returning();

    // Обновляем жанры фильма (если переданы)
    if (genres && Array.isArray(genres)) {
      // Удаляем старые связи
      await db.delete(filmGenres).where(eq(filmGenres.filmId, id));

      // Добавляем новые связи
      if (genres.length > 0) {
        await db.insert(filmGenres).values(
          genres.map((genreId: number) => ({
            filmId: id,
            genreId,
          })),
        );
      }
    }

    // Обновляем актёров фильма (если переданы)
    if (actors && Array.isArray(actors)) {
      // Удаляем старые связи
      await db.delete(filmActors).where(eq(filmActors.filmId, id));

      // Добавляем новые связи
      if (actors.length > 0) {
        await db.insert(filmActors).values(
          actors.map((actor: { id: number; role?: string }) => ({
            filmId: id,
            actorId: actor.id,
            role: actor.role || null,
          })),
        );
      }
    }

    res.json(updatedFilm[0]);
  } catch (error) {
    next(error);
  }
};

// Обновить медиа фильма (filmUrl и trailerUrl)
export const updateFilmMedia = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Получаем текущие данные фильма
    const existingFilm = await db
      .select()
      .from(films)
      .where(eq(films.id, id))
      .limit(1);

    if (!existingFilm[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

    let trailerUrl = req.body.trailerFile;
    let filmUrl = req.body.filmFile;

    // Получаем пути к загруженным видео файлам
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Обработка trailerUrl
    if (files?.trailerFile?.[0]) {
      // Удаляем старый трейлер если загружается новый
      if (existingFilm[0].trailerUrl) {
        deleteFile(existingFilm[0].trailerUrl);
      }
      trailerUrl = `/${files.trailerFile[0].path.replace(/\\/g, '/')}`;
    } else if (trailerUrl === 'null') {
      // Если передано "null", удаляем текущий трейлер
      if (existingFilm[0].trailerUrl) {
        deleteFile(existingFilm[0].trailerUrl);
      }
      trailerUrl = null;
    } else if (trailerUrl === undefined) {
      // Если поле не передано, оставляем текущее значение
      trailerUrl = existingFilm[0].trailerUrl;
    }

    // Обработка filmUrl
    if (files?.filmFile?.[0]) {
      // Удаляем старое видео фильма если загружается новое
      if (existingFilm[0].filmUrl) {
        deleteFile(existingFilm[0].filmUrl);
      }
      filmUrl = `/${files.filmFile[0].path.replace(/\\/g, '/')}`;
    } else if (filmUrl === 'null') {
      // Если передано "null", удаляем текущее видео
      if (existingFilm[0].filmUrl) {
        deleteFile(existingFilm[0].filmUrl);
      }
      filmUrl = null;
    } else if (filmUrl === undefined) {
      // Если поле не передано, оставляем текущее значение
      filmUrl = existingFilm[0].filmUrl;
    }

    const updatedFilm = await db
      .update(films)
      .set({
        trailerUrl,
        filmUrl,
      })
      .where(eq(films.id, id))
      .returning();

    res.json(updatedFilm[0]);
  } catch (error) {
    next(error);
  }
};

// Удалить фильм
export const deleteFilm = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Получаем данные фильма перед удалением для удаления медиа файлов
    const filmToDelete = await db
      .select()
      .from(films)
      .where(eq(films.id, id))
      .limit(1);

    if (!filmToDelete[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

    // Удаляем медиа файлы
    if (filmToDelete[0].image) {
      deleteFile(filmToDelete[0].image);
    }
    if (filmToDelete[0].trailerUrl) {
      deleteFile(filmToDelete[0].trailerUrl);
    }
    if (filmToDelete[0].filmUrl) {
      deleteFile(filmToDelete[0].filmUrl);
    }

    const deletedFilm = await db
      .delete(films)
      .where(eq(films.id, id))
      .returning();

    res.json(deletedFilm[0]);
  } catch (error) {
    next(error);
  }
};

// Поиск фильмов (только видимые)
export const searchFilms = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectFields = getFilmSelectFields();

    // Получаем userId из middleware (если пользователь авторизован)
    const userId = req.user.userId;

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Базовые условия: видимые фильмы + поиск по имени если указан
    const baseConditions = [eq(films.isVisible, true)];

    const { query } = req.query;
    if (query && typeof query === 'string') {
      baseConditions.push(like(films.name, `%${query}%`));
    }

    const baseCondition = and(...baseConditions);

    // Комбинируем с дополнительными фильтрами
    const finalCondition = whereCondition
      ? and(baseCondition, whereCondition)
      : baseCondition;

    // Базовый запрос
    const baseQuery = db.select(selectFields).from(films);

    // Запрос данных с пагинацией
    const queryWithWhere = baseQuery.where(finalCondition);
    const queryWithOrder = orderByClause
      ? queryWithWhere.orderBy(orderByClause)
      : queryWithWhere.orderBy(desc(films.createdAt));

    const searchResults = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const totalCountResult = await db
      .select({ count: count() })
      .from(films)
      .where(finalCondition);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    // Обогащаем данные жанрами, актёрами, рейтингом и доступом
    const filmsWithDetails = await enrichFilmsWithDetails(
      searchResults,
      userId,
    );

    res.json({
      data: filmsWithDetails,
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

// Скрыть/показать фильм (только для админов)
export const toggleFilmVisibility = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const film = await db.select().from(films).where(eq(films.id, id)).limit(1);

    if (!film[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

    const updatedFilm = await db
      .update(films)
      .set({ isVisible: !film[0].isVisible })
      .where(eq(films.id, id))
      .returning();

    res.json(updatedFilm[0]);
  } catch (error) {
    next(error);
  }
};

// Получить купленные фильмы пользователя
export const getUserPurchasedFilms = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user.userId;
    const selectFields = getFilmSelectFields();

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Обработка параметров фильтрации
    const searchQuery = req.query.search || req.query.query;

    // Обработка жанров
    const genreIds = parseArrayParam(req.query.genres);

    // Обработка актёров
    const actorIds = parseArrayParam(req.query.actors);

    // Проверяем сортировку по рейтингу или количеству оценок
    const sort = req.query.sort as any;
    let ratingSort: { desc: boolean } | null = null;
    let reviewCountSort: { desc: boolean } | null = null;

    if (sort && Array.isArray(sort) && sort.length > 0) {
      const firstSort = sort[0];
      if (firstSort && firstSort.id === 'rating') {
        ratingSort = { desc: firstSort.desc === 'true' };
      } else if (firstSort && firstSort.id === 'reviewCount') {
        reviewCountSort = { desc: firstSort.desc === 'true' };
      }
    }

    // Получаем ID фильмов, которые купил пользователь
    const purchasedFilmIds = db
      .selectDistinct({ filmId: userPurchasedFilms.filmId })
      .from(userPurchasedFilms)
      .where(eq(userPurchasedFilms.userId, userId));

    // Базовые условия: видимые фильмы + купленные пользователем
    const baseConditions = [
      eq(films.isVisible, true),
      inArray(films.id, purchasedFilmIds),
    ];

    // Поиск по названию фильма
    if (searchQuery && typeof searchQuery === 'string') {
      baseConditions.push(ilike(films.name, `%${searchQuery}%`));
    }

    // Фильтр по жанрам
    if (genreIds.length > 0) {
      const filmIdsWithGenres = db
        .selectDistinct({ filmId: filmGenres.filmId })
        .from(filmGenres)
        .where(inArray(filmGenres.genreId, genreIds.map(Number)));

      baseConditions.push(inArray(films.id, filmIdsWithGenres));
    }

    // Фильтр по актёрам
    if (actorIds.length > 0) {
      const filmIdsWithActors = db
        .selectDistinct({ filmId: filmActors.filmId })
        .from(filmActors)
        .where(inArray(filmActors.actorId, actorIds.map(Number)));

      baseConditions.push(inArray(films.id, filmIdsWithActors));
    }

    const finalCondition = and(...baseConditions);

    // Базовый запрос
    let baseQuery;

    if (ratingSort || reviewCountSort) {
      // Если сортировка по рейтингу или количеству оценок
      baseQuery = db
        .select({
          ...selectFields,
          avgRating: avg(reviews.rating),
          reviewCount: count(reviews.id),
        })
        .from(films)
        .leftJoin(
          reviews,
          and(eq(films.id, reviews.filmId), eq(reviews.isApproved, true)),
        )
        .where(finalCondition)
        .groupBy(films.id);
    } else {
      // Обычный запрос без JOIN
      baseQuery = db.select(selectFields).from(films).where(finalCondition);
    }

    // Запрос данных с пагинацией
    let queryWithOrder;
    if (ratingSort) {
      // Сортировка по рейтингу (фильмы без рейтинга всегда внизу)
      if (ratingSort.desc) {
        queryWithOrder = baseQuery.orderBy(
          sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
          desc(avg(reviews.rating)),
        );
      } else {
        queryWithOrder = baseQuery.orderBy(
          sql`CASE WHEN ${avg(reviews.rating)} IS NULL THEN 1 ELSE 0 END`,
          avg(reviews.rating),
        );
      }
    } else if (reviewCountSort) {
      // Сортировка по количеству оценок
      queryWithOrder = reviewCountSort.desc
        ? baseQuery.orderBy(desc(count(reviews.id)))
        : baseQuery.orderBy(count(reviews.id));
    } else if (orderByClause) {
      queryWithOrder = baseQuery.orderBy(orderByClause);
    } else {
      queryWithOrder = baseQuery.orderBy(desc(films.createdAt));
    }

    const purchasedFilms = await queryWithOrder
      .limit(pagination.limit)
      .offset(pagination.offset);

    // Запрос общего количества
    const totalCountResult = await db
      .select({ count: count() })
      .from(films)
      .where(finalCondition);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);

    // Обогащаем данные жанрами, актёрами, рейтингом и доступом
    const filmsWithDetails = await enrichFilmsWithDetails(
      purchasedFilms,
      userId,
    );

    res.json({
      data: filmsWithDetails,
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
