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
  decimal,
  jsonb,
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
  createdAt: timestamp('created_at').defaultNow(),
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

// Тарифные планы
export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('RUB'),
  durationDays: integer('duration_days').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Заказы
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  planId: integer('plan_id').references(() => subscriptionPlans.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('RUB'),
  status: varchar('status', { length: 20 }).default('pending'), // pending, paid, failed, cancelled
  paymentMethod: varchar('payment_method', { length: 50 }),
  externalPaymentId: varchar('external_payment_id', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  paidAt: timestamp('paid_at'),
  expiresAt: timestamp('expires_at'),
});

// Подписки (обновленная версия)
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  planId: integer('plan_id').references(() => subscriptionPlans.id),
  orderId: integer('order_id').references(() => orders.id),
  status: varchar('status', { length: 20 }).default('active'), // active, expired, cancelled
  startedAt: timestamp('started_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  autoRenew: boolean('auto_renew').default(false),
  createdAt: timestamp('created_at').defaultNow(),
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

// Обновленные связи
export const subscriptionPlansRelations = relations(
  subscriptionPlans,
  ({ many }) => ({
    orders: many(orders),
    subscriptions: many(subscriptions),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [orders.planId],
    references: [subscriptionPlans.id],
  }),
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  order: one(orders, {
    fields: [subscriptions.orderId],
    references: [orders.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  reviews: many(reviews),
  subscriptions: many(subscriptions),
  orders: many(orders),
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
