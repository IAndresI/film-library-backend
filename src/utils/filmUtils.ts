import { eq, and, avg, or, gt, isNull } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  films,
  genres,
  actors,
  filmGenres,
  filmActors,
  reviews,
  userPurchasedFilms,
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

// Функция для проверки доступа пользователя к фильму
export const checkFilmAccess = async (
  userId: number,
  filmId: number,
): Promise<{
  hasAccess: boolean;
  accessType: 'free' | 'purchased' | 'none';
}> => {
  // Получаем информацию о фильме
  const film = await db
    .select()
    .from(films)
    .where(eq(films.id, filmId))
    .limit(1);

  if (!film[0]) {
    return { hasAccess: false, accessType: 'none' };
  }

  // Если фильм бесплатный
  if (!film[0].isPaid) {
    return { hasAccess: true, accessType: 'free' };
  }

  // Проверяем покупку фильма
  const purchase = await db
    .select()
    .from(userPurchasedFilms)
    .where(
      and(
        eq(userPurchasedFilms.userId, userId),
        eq(userPurchasedFilms.filmId, filmId),
        or(
          isNull(userPurchasedFilms.expiresAt),
          gt(userPurchasedFilms.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);

  if (purchase.length > 0) {
    return { hasAccess: true, accessType: 'purchased' };
  }

  return { hasAccess: false, accessType: 'none' };
};

// Функция для обогащения данных фильмов информацией о доступе
export const enrichFilmsWithAccess = async (
  filmsData: any[],
  userId?: number,
) => {
  if (!userId) {
    // Если пользователь не авторизован, показываем только статус платности
    return filmsData.map((film) => ({
      ...film,
      hasAccess: !film.isPaid,
      accessType: film.isPaid ? 'none' : 'free',
      isPurchased: false,
    }));
  }

  // Получаем все купленные фильмы пользователя
  const purchasedFilms = await db
    .select({ filmId: userPurchasedFilms.filmId })
    .from(userPurchasedFilms)
    .where(
      and(
        eq(userPurchasedFilms.userId, userId),
        or(
          isNull(userPurchasedFilms.expiresAt),
          gt(userPurchasedFilms.expiresAt, new Date()),
        ),
      ),
    );

  const purchasedFilmIds = new Set(purchasedFilms.map((p) => p.filmId));

  // Обогащаем каждый фильм информацией о доступе
  return filmsData.map((film) => {
    let hasAccess = false;
    let accessType: 'free' | 'purchased' | 'none' = 'none';

    if (!film.isPaid) {
      hasAccess = true;
      accessType = 'free';
    } else if (purchasedFilmIds.has(film.id)) {
      hasAccess = true;
      accessType = 'purchased';
    }

    return {
      ...film,
      hasAccess,
      accessType,
      isPurchased: purchasedFilmIds.has(film.id),
    };
  });
};

// Функция для обогащения данных фильмов жанрами, актёрами, рейтингом и доступом
export const enrichFilmsWithDetails = async (
  filmsData: any[],
  userId?: number,
) => {
  // Сначала обогащаем базовыми данными
  const filmsWithDetails = await Promise.all(
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

  // Затем добавляем информацию о доступе
  return await enrichFilmsWithAccess(filmsWithDetails, userId);
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
  isPaid: films.isPaid,
  price: films.price,
});
