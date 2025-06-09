import { eq, and, avg } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  films,
  genres,
  actors,
  filmGenres,
  filmActors,
  reviews,
} from '../schema';

// Функция для получения рейтинга фильма
export const getFilmRating = async (filmId: number): Promise<number | null> => {
  const ratingResult = await db
    .select({
      avgRating: avg(reviews.rating),
    })
    .from(reviews)
    .where(and(eq(reviews.filmId, filmId), eq(reviews.isApproved, true)));

  return ratingResult[0]?.avgRating ? Number(ratingResult[0].avgRating) : null;
};

// Функция для обогащения данных фильмов жанрами, актёрами и рейтингом
export const enrichFilmsWithDetails = async (filmsData: any[]) => {
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

// Общий селект объект для всех запросов фильмов
export const getFilmSelectFields = () => ({
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
