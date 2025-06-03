import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  primaryKey,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Пользователи
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  avatar: varchar('avatar', { length: 500 }),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  isAdmin: boolean('is_admin').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Таблица OTP кодов
export const otpCodes = pgTable('otp_codes', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  isUsed: boolean('is_used').default(false),
  attempts: integer('attempts').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Жанры
export const genres = pgTable('genres', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  icon: varchar('icon', { length: 255 }),
});

// Актёры
export const actors = pgTable('actors', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  image: varchar('image', { length: 500 }),
  birthday: date('birthday'),
  description: text('description'),
  isVisible: boolean('is_visible').default(true),
});

// Фильмы
export const films = pgTable('films', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  image: varchar('image', { length: 500 }),
  releaseDate: date('release_date'),
  createdAt: timestamp('created_at').defaultNow(),
  trailerUrl: varchar('trailer_url', { length: 500 }),
  filmUrl: varchar('film_url', { length: 500 }),
  isVisible: boolean('is_visible').default(true),
});

// Отзывы
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  rating: integer('rating').notNull(),
  text: text('text'),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  filmId: integer('film_id').references(() => films.id, {
    onDelete: 'cascade',
  }),
  isApproved: boolean('is_approved').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Подписки
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

// Связь фильм-жанр (многие ко многим)
export const filmGenres = pgTable(
  'film_genres',
  {
    filmId: integer('film_id').references(() => films.id, {
      onDelete: 'cascade',
    }),
    genreId: integer('genre_id').references(() => genres.id, {
      onDelete: 'cascade',
    }),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.filmId, table.genreId] }),
    };
  },
);

// Связь фильм-актёр (многие ко многим)
export const filmActors = pgTable(
  'film_actors',
  {
    filmId: integer('film_id').references(() => films.id, {
      onDelete: 'cascade',
    }),
    actorId: integer('actor_id').references(() => actors.id, {
      onDelete: 'cascade',
    }),
    role: varchar('role', { length: 100 }),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.filmId, table.actorId] }),
    };
  },
);

// Избранное пользователя
export const userFavorites = pgTable(
  'user_favorites',
  {
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    filmId: integer('film_id').references(() => films.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.userId, table.filmId] }),
    };
  },
);

// История просмотров
export const watchHistory = pgTable('watch_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  filmId: integer('film_id').references(() => films.id, {
    onDelete: 'cascade',
  }),
  watchedAt: timestamp('watched_at').defaultNow(),
  progress: integer('progress').default(0),
});

// Связи между таблицами
export const usersRelations = relations(users, ({ many }) => ({
  reviews: many(reviews),
  subscriptions: many(subscriptions),
  favorites: many(userFavorites),
  watchHistory: many(watchHistory),
}));

export const filmsRelations = relations(films, ({ many }) => ({
  reviews: many(reviews),
  genres: many(filmGenres),
  actors: many(filmActors),
  userFavorites: many(userFavorites),
  watchHistory: many(watchHistory),
}));

export const genresRelations = relations(genres, ({ many }) => ({
  films: many(filmGenres),
}));

export const actorsRelations = relations(actors, ({ many }) => ({
  films: many(filmActors),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  film: one(films, {
    fields: [reviews.filmId],
    references: [films.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const filmGenresRelations = relations(filmGenres, ({ one }) => ({
  film: one(films, {
    fields: [filmGenres.filmId],
    references: [films.id],
  }),
  genre: one(genres, {
    fields: [filmGenres.genreId],
    references: [genres.id],
  }),
}));

export const filmActorsRelations = relations(filmActors, ({ one }) => ({
  film: one(films, {
    fields: [filmActors.filmId],
    references: [films.id],
  }),
  actor: one(actors, {
    fields: [filmActors.actorId],
    references: [actors.id],
  }),
}));

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userFavorites.userId],
    references: [users.id],
  }),
  film: one(films, {
    fields: [userFavorites.filmId],
    references: [films.id],
  }),
}));

export const watchHistoryRelations = relations(watchHistory, ({ one }) => ({
  user: one(users, {
    fields: [watchHistory.userId],
    references: [users.id],
  }),
  film: one(films, {
    fields: [watchHistory.filmId],
    references: [films.id],
  }),
}));
