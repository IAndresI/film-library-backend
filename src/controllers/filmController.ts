import { Request, Response, NextFunction } from 'express';
import { eq, desc, like, avg } from 'drizzle-orm';
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

// Функция для получения рейтинга фильма
const getFilmRating = async (filmId: number): Promise<number | null> => {
  const ratingResult = await db
    .select({
      avgRating: avg(reviews.rating),
    })
    .from(reviews)
    .where(eq(reviews.filmId, filmId) && eq(reviews.isApproved, true));

  return ratingResult[0]?.avgRating ? Number(ratingResult[0].avgRating) : null;
};

// Получить все видимые фильмы (с опциональной фильтрацией по жанру)
export const getFilms = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { genreId } = req.query;

    // Получаем все видимые фильмы
    const allFilms = await db
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
      })
      .from(films)
      .where(eq(films.isVisible, true))
      .orderBy(desc(films.createdAt));

    // Для каждого фильма получаем жанры, актёров и рейтинг
    const filmsWithDetails = await Promise.all(
      allFilms.map(async (film) => {
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
          })
          .from(actors)
          .innerJoin(filmActors, eq(actors.id, filmActors.actorId))
          .where(eq(filmActors.filmId, film.id) && eq(actors.isVisible, true));

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

    // Если указан genreId, фильтруем результат
    let result = filmsWithDetails;
    if (genreId && !isNaN(Number(genreId))) {
      result = filmsWithDetails.filter((film) =>
        film.genres.some((genre) => genre.id === Number(genreId)),
      );
    }

    res.json(result);
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
    const allFilms = await db
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
      })
      .from(films)
      .orderBy(desc(films.createdAt));

    // Для каждого фильма получаем жанры, актёров и рейтинг
    const filmsWithDetails = await Promise.all(
      allFilms.map(async (film) => {
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
          })
          .from(actors)
          .innerJoin(filmActors, eq(actors.id, filmActors.actorId))
          .where(eq(filmActors.filmId, film.id) && eq(actors.isVisible, true));

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

    res.json(filmsWithDetails);
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
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ message: 'Параметр поиска обязателен' });
      return;
    }

    const searchResults = await db
      .select()
      .from(films)
      .where(like(films.name, `%${query}%`) && eq(films.isVisible, true))
      .orderBy(desc(films.createdAt));

    // Для каждого фильма получаем жанры, актёров и рейтинг
    const filmsWithDetails = await Promise.all(
      searchResults.map(async (film) => {
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
          })
          .from(actors)
          .innerJoin(filmActors, eq(actors.id, filmActors.actorId))
          .where(eq(filmActors.filmId, film.id) && eq(actors.isVisible, true));

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

    res.json(filmsWithDetails);
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
