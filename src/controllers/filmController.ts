import { Request, Response, NextFunction } from 'express';
import { eq, desc, like } from 'drizzle-orm';
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

// Получить все видимые фильмы
export const getFilms = async (
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
      .where(eq(films.isVisible, true))
      .orderBy(desc(films.createdAt));

    res.json(allFilms);
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

    res.json(allFilms);
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

    const result = {
      ...film[0],
      genres: filmGenresList,
      actors: filmActorsList,
      reviews: filmReviews,
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
      image,
      releaseDate,
      trailerUrl,
      filmUrl,
      isVisible,
    } = req.body;

    const newFilm = await db
      .insert(films)
      .values({
        name,
        description,
        image,
        releaseDate,
        trailerUrl,
        filmUrl,
        isVisible: isVisible ?? true,
      })
      .returning();

    res.status(201).json(newFilm[0]);
  } catch (error) {
    next(error);
  }
};

// Обновить фильм
export const updateFilm = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      name,
      description,
      image,
      releaseDate,
      trailerUrl,
      filmUrl,
      isVisible,
    } = req.body;

    const updatedFilm = await db
      .update(films)
      .set({
        name,
        description,
        image,
        releaseDate,
        trailerUrl,
        filmUrl,
        isVisible,
      })
      .where(eq(films.id, id))
      .returning();

    if (!updatedFilm[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

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

    const deletedFilm = await db
      .delete(films)
      .where(eq(films.id, id))
      .returning();

    if (!deletedFilm[0]) {
      res.status(404).json({ message: 'Фильм не найден' });
      return;
    }

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

    res.json(searchResults);
  } catch (error) {
    next(error);
  }
};

// Получить фильмы по жанру (только видимые)
export const getFilmsByGenre = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const genreId = parseInt(req.params.genreId, 10);

    const filmsByGenre = await db
      .select({
        id: films.id,
        name: films.name,
        description: films.description,
        image: films.image,
        releaseDate: films.releaseDate,
        trailerUrl: films.trailerUrl,
        filmUrl: films.filmUrl,
        createdAt: films.createdAt,
      })
      .from(films)
      .innerJoin(filmGenres, eq(films.id, filmGenres.filmId))
      .where(eq(filmGenres.genreId, genreId) && eq(films.isVisible, true))
      .orderBy(desc(films.createdAt));

    res.json(filmsByGenre);
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
