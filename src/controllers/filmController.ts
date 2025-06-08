import { Request, Response, NextFunction } from 'express';
import { eq, desc, like, avg, and, count, inArray } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  films,
  genres,
  actors,
  filmGenres,
  filmActors,
  reviews,
  users,
} from '../schema';
import { deleteFile } from '../utils/fileUtils';
import {
  parseSortParams,
  parseFilterParams,
  parsePaginationParams,
} from '../utils/queryParser';

// Общий селект объект для всех запросов
const getSelectFields = () => ({
  id: films.id,
  name: films.name,
  description: films.description,
  image: films.image,
  releaseDate: films.releaseDate,
  trailerUrl: films.trailerUrl,
  filmUrl: films.filmUrl,
  createdAt: films.createdAt,
  isVisible: films.isVisible,
});

// Общая функция для обогащения данных фильмов жанрами, актёрами и рейтингом
const enrichFilmsWithDetails = async (filmsData: any[]) => {
  return Promise.all(
    filmsData.map(async (film) => {
      // Жанры фильма
      const filmGenresList = await db
        .select({
          id: genres.id,
          name: genres.name,
          icon: genres.icon,
        })
        .from(genres)
        .innerJoin(filmGenres, eq(genres.id, filmGenres.genreId))
        .where(eq(filmGenres.filmId, film.id));

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
        .where(and(eq(filmActors.filmId, film.id), eq(actors.isVisible, true)));

      // Рейтинг фильма
      const rating = await getFilmRating(film.id);

      return {
        ...film,
        genres: filmGenresList,
        actors: filmActorsList,
        rating,
      };
    }),
  );
};

// Функция для получения рейтинга фильма
const getFilmRating = async (filmId: number): Promise<number | null> => {
  const ratingResult = await db
    .select({
      avgRating: avg(reviews.rating),
    })
    .from(reviews)
    .where(and(eq(reviews.filmId, filmId), eq(reviews.isApproved, true)));

  return ratingResult[0]?.avgRating ? Number(ratingResult[0].avgRating) : null;
};

// Получить все видимые фильмы (с опциональной фильтрацией по жанру)
export const getFilms = async (
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

    // Базовое условие: только видимые фильмы
    const baseCondition = eq(films.isVisible, true);

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

    // Отзывы (включая неодобренные)
    const filmReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        text: reviews.text,
        createdAt: reviews.createdAt,
        isApproved: reviews.isApproved,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.filmId, id))
      .orderBy(desc(reviews.createdAt));

    // Рейтинг фильма
    const rating = await getFilmRating(id);

    const result = {
      ...film[0],
      genres: filmGenresList,
      actors: filmActorsList,
      reviews: filmReviews,
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
    const selectFields = getSelectFields();

    // Парсинг параметров
    const orderByClause = parseSortParams(req, selectFields);
    const whereCondition = parseFilterParams(req, selectFields);
    const pagination = parsePaginationParams(req);

    // Отдельно обрабатываем сортировку по рейтингу и фильтры по жанрам
    let ratingSort: { desc: boolean } | null = null;
    const genreFilters: number[] = [];
    const queryKeys = Object.keys(req.query);

    let sortId: string | undefined;
    let sortDesc: string | undefined;

    queryKeys.forEach((key) => {
      // Обрабатываем сортировку
      const sortMatch = key.match(/^sort\[(\d+)\]\[(.+)\]$/);
      if (sortMatch) {
        const field = sortMatch[2];
        if (field === 'id') {
          sortId = req.query[key] as string;
        } else if (field === 'desc') {
          sortDesc = req.query[key] as string;
        }
      }

      // Обрабатываем фильтры по жанрам
      const filterMatch = key.match(/^filters\[(\d+)\]\[(.+)\]$/);
      if (filterMatch) {
        const field = filterMatch[2];
        if (field === 'id' && req.query[key] === 'genres') {
          // Ищем соответствующие значения жанров
          const index = filterMatch[1];
          const valueArrayKeys = queryKeys.filter((k) =>
            k.startsWith(`filters[${index}][value][`),
          );

          valueArrayKeys.forEach((vKey) => {
            genreFilters.push(Number(req.query[vKey]));
          });
        }
      }
    });

    if (sortId === 'rating' && sortDesc !== undefined) {
      ratingSort = { desc: sortDesc === 'true' };
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
      // Сортировка по рейтингу
      queryWithOrder = ratingSort.desc
        ? filmsQuery.orderBy(desc(avg(reviews.rating)))
        : filmsQuery.orderBy(avg(reviews.rating));
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
      .where(eq(filmActors.filmId, id) && eq(actors.isVisible, true));

    // Отзывы (только одобренные)
    const filmReviews = await db
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
      .where(eq(reviews.filmId, id) && eq(reviews.isApproved, true))
      .orderBy(desc(reviews.createdAt));

    // Рейтинг фильма
    const rating = await getFilmRating(id);

    const result = {
      ...film[0],
      genres: filmGenresList,
      actors: filmActorsList,
      reviews: filmReviews,
      rating,
    };

    res.json(result);
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
    const { name, description, releaseDate, isVisible, genres, actors } =
      req.body;

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

    let trailerUrl = req.body.trailerUrl;
    let filmUrl = req.body.filmUrl;

    // Получаем пути к загруженным видео файлам
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (files?.trailerFile?.[0]) {
      // Удаляем старый трейлер если загружается новый
      if (existingFilm[0].trailerUrl) {
        deleteFile(existingFilm[0].trailerUrl);
      }
      trailerUrl = `/${files.trailerFile[0].path.replace(/\\/g, '/')}`;
    }
    if (files?.filmFile?.[0]) {
      // Удаляем старое видео фильма если загружается новое
      if (existingFilm[0].filmUrl) {
        deleteFile(existingFilm[0].filmUrl);
      }
      filmUrl = `/${files.filmFile[0].path.replace(/\\/g, '/')}`;
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
    const selectFields = getSelectFields();

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

    // Обогащаем данные жанрами, актёрами и рейтингом
    const filmsWithDetails = await enrichFilmsWithDetails(searchResults);

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
