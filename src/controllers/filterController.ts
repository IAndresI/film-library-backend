import { Request, Response, NextFunction } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { films, actors, genres } from '../schema';

// Получить все фильмы для фильтров
export const getFilmsForFilters = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filmsData = await db
      .select({
        id: films.id,
        name: films.name,
      })
      .from(films)
      .where(eq(films.isVisible, true))
      .orderBy(films.name);

    const result = filmsData.map((film) => ({
      label: film.name,
      value: film.id.toString(),
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Получить всех актёров для фильтров
export const getActorsForFilters = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actorsData = await db
      .select({
        id: actors.id,
        name: actors.name,
      })
      .from(actors)
      .where(eq(actors.isVisible, true))
      .orderBy(actors.name);

    const result = actorsData.map((actor) => ({
      label: actor.name,
      value: actor.id.toString(),
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Получить все жанры для фильтров
export const getGenresForFilters = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const genresData = await db
      .select({
        id: genres.id,
        name: genres.name,
      })
      .from(genres)
      .orderBy(genres.name);

    const result = genresData.map((genre) => ({
      label: genre.name,
      value: genre.id.toString(),
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Получить все данные для фильтров одним запросом
export const getAllFiltersData = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Получаем все данные параллельно
    const [filmsData, actorsData, genresData] = await Promise.all([
      db
        .select({
          id: films.id,
          name: films.name,
        })
        .from(films)
        .where(eq(films.isVisible, true))
        .orderBy(films.name),

      db
        .select({
          id: actors.id,
          name: actors.name,
        })
        .from(actors)
        .where(eq(actors.isVisible, true))
        .orderBy(actors.name),

      db
        .select({
          id: genres.id,
          name: genres.name,
        })
        .from(genres)
        .orderBy(genres.name),
    ]);

    const result = {
      films: filmsData.map((film) => ({
        label: film.name,
        value: film.id.toString(),
      })),
      actors: actorsData.map((actor) => ({
        label: actor.name,
        value: actor.id.toString(),
      })),
      genres: genresData.map((genre) => ({
        label: genre.name,
        value: genre.id.toString(),
      })),
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Получить все данные для фильтров одним запросом (для админов)
export const getAllFiltersDataAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Получаем все данные параллельно (включая скрытые)
    const [filmsData, actorsData, genresData] = await Promise.all([
      db
        .select({
          id: films.id,
          name: films.name,
        })
        .from(films)
        .orderBy(films.name),

      db
        .select({
          id: actors.id,
          name: actors.name,
        })
        .from(actors)
        .orderBy(actors.name),

      db
        .select({
          id: genres.id,
          name: genres.name,
        })
        .from(genres)
        .orderBy(genres.name),
    ]);

    const result = {
      films: filmsData.map((film) => ({
        label: film.name,
        value: film.id.toString(),
      })),
      actors: actorsData.map((actor) => ({
        label: actor.name,
        value: actor.id.toString(),
      })),
      genres: genresData.map((genre) => ({
        label: genre.name,
        value: genre.id.toString(),
      })),
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
};
