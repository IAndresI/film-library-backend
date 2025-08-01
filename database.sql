-- Создание базы данных для фильмотеки
-- PostgreSQL schema

-- Таблица пользователей
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    avatar VARCHAR(500),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица OTP кодов
CREATE TABLE otp_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица жанров
CREATE TABLE genres (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    icon VARCHAR(255)
);

-- Таблица актеров
CREATE TABLE actors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    image VARCHAR(500),
    birthday DATE,
    description TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица фильмов
CREATE TABLE films (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image VARCHAR(500),
    release_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trailer_url VARCHAR(500),
    film_url VARCHAR(500),
    is_visible BOOLEAN DEFAULT TRUE,
    is_paid BOOLEAN DEFAULT FALSE,
    price DECIMAL(10,2) DEFAULT 0.00
);

-- Таблица отзывов
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
    text TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица тарифных планов
CREATE TABLE subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'RUB',
    duration_days INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица заказов
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES subscription_plans(id),
    film_id INTEGER REFERENCES films(id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'RUB',
    order_type VARCHAR(20) NOT NULL, -- subscription или film
    order_status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, cancelled
    payment_method VARCHAR(50), -- bank_card, sbp, wallet, etc
    external_payment_id VARCHAR(255), -- ID платежа в YooKassa
    metadata JSONB, -- дополнительные данные от платежной системы
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    expires_at TIMESTAMP -- когда заказ истекает если не оплачен
);

-- Таблица подписок (обновленная)
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES subscription_plans(id),
    order_id INTEGER REFERENCES orders(id),
    subscription_status VARCHAR(20) DEFAULT 'active', -- active, expired, cancelled
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    auto_renew BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Связующая таблица фильм-жанр (многие ко многим)
CREATE TABLE film_genres (
    film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
    genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (film_id, genre_id)
);

-- Связующая таблица фильм-актер (многие ко многим)
CREATE TABLE film_actors (
    film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES actors(id) ON DELETE CASCADE,
    role VARCHAR(100), -- роль актера в фильме
    PRIMARY KEY (film_id, actor_id)
);

-- Таблица избранного пользователя
CREATE TABLE user_favorites (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, film_id)
);

-- Таблица истории просмотров
CREATE TABLE watch_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100) -- процент просмотра
);

-- Купленные фильмы пользователей
CREATE TABLE user_purchased_films (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    film_id INTEGER REFERENCES films(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id),
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- null означает бессрочный доступ
    UNIQUE(user_id, film_id) -- пользователь не может купить один и тот же фильм дважды
);

-- Индексы для оптимизации
CREATE INDEX idx_otp_email ON otp_codes(email);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);
CREATE INDEX idx_reviews_film_id ON reviews(film_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_approved ON reviews(is_approved);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_external_id ON orders(external_payment_id);
CREATE INDEX idx_orders_expires_at ON orders(expires_at);
CREATE INDEX idx_orders_film_id ON orders(film_id);
CREATE INDEX idx_films_paid ON films(is_paid);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX idx_subscriptions_status ON subscriptions(subscription_status);
CREATE INDEX idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX idx_watch_history_film_id ON watch_history(film_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_admin ON users(is_admin);
CREATE INDEX idx_films_release_date ON films(release_date);
CREATE INDEX idx_films_visible ON films(is_visible);
CREATE INDEX idx_actors_visible ON actors(is_visible);
CREATE INDEX idx_purchased_films_user_id ON user_purchased_films(user_id);
CREATE INDEX idx_purchased_films_film_id ON user_purchased_films(film_id);
CREATE INDEX idx_purchased_films_order_id ON user_purchased_films(order_id);
CREATE INDEX idx_purchased_films_expires_at ON user_purchased_films(expires_at);

-- ============= ТЕСТОВЫЕ ДАННЫЕ =============

-- Добавляем пользователей
INSERT INTO users (name, email, avatar, is_admin) VALUES
    ('Александр Петров', 'alex.petrov@mail.ru', 'https://avatar.com/alex.jpg', TRUE),
    ('Мария Иванова', 'maria.ivanova@yandex.ru', 'https://avatar.com/maria.jpg', FALSE),
    ('Дмитрий Сидоров', 'dmitry.sidorov@gmail.com', 'https://avatar.com/dmitry.jpg', FALSE),
    ('Анна Козлова', 'anna.kozlova@mail.ru', 'https://avatar.com/anna.jpg', FALSE),
    ('Сергей Смирнов', 'sergey.smirnov@bk.ru', 'https://avatar.com/sergey.jpg', FALSE);

-- Добавляем жанры
INSERT INTO genres (name, icon) VALUES
    ('Боевик', '🔫'),
    ('Комедия', '😂'),
    ('Драма', '🎭'),
    ('Фантастика', '🚀'),
    ('Ужасы', '👻'),
    ('Мелодрама', '💕'),
    ('Триллер', '🔪'),
    ('Детектив', '🔍'),
    ('Приключения', '🗺️'),
    ('Мультфильм', '🎨'),
    ('Документальный', '📹'),
    ('Военный', '⚔️');

-- Добавляем актеров
INSERT INTO actors (name, image, birthday, description, is_visible) VALUES
    ('Леонардо ДиКаприо', 'https://images.com/dicaprio.jpg', '1974-11-11', 'Американский актёр и продюсер. Лауреат премии "Оскар"', TRUE),
    ('Скарлетт Йоханссон', 'https://images.com/johansson.jpg', '1984-11-22', 'Американская актриса, певица и модель', TRUE),
    ('Роберт Дауни мл.', 'https://images.com/downey.jpg', '1965-04-04', 'Американский актёр, продюсер и музыкант', TRUE),
    ('Натали Портман', 'https://images.com/portman.jpg', '1981-06-09', 'Американская и израильская актриса и режиссёр', TRUE),
    ('Мэтт Дэймон', 'https://images.com/damon.jpg', '1970-10-08', 'Американский актёр, продюсер и сценарист', TRUE),
    ('Анжелина Джоли', 'https://images.com/jolie.jpg', '1975-06-04', 'Американская актриса, режиссёр и продюсер', TRUE),
    ('Том Ханкс', 'https://images.com/hanks.jpg', '1956-07-09', 'Американский актёр, режиссёр и продюсер', TRUE),
    ('Шарлиз Терон', 'https://images.com/theron.jpg', '1975-08-07', 'Южноафриканская и американская актриса и продюсер', TRUE),
    ('Хью Джекман', 'https://images.com/jackman.jpg', '1968-10-12', 'Австралийский актёр, певец и продюсер', TRUE),
    ('Эмма Стоун', 'https://images.com/stone.jpg', '1988-11-06', 'Американская актриса', TRUE);

-- Добавляем фильмы
INSERT INTO films (name, description, image, release_date, trailer_url, film_url, is_visible, is_paid, price) VALUES
    ('Начало', 'Дом Кобб — талантливый вор, лучший из лучших в опасном искусстве извлечения: он крадёт ценные секреты из глубин подсознания во время сна.', 'https://images.com/inception.jpg', '2010-07-16', 'https://trailers.com/inception', 'https://films.com/inception', TRUE, FALSE, 0.00),
    ('Мстители: Финал', 'После разрушительных событий "Войны бесконечности" вселенная лежит в руинах. Оставшиеся в живых Мстители должны собраться снова.', 'https://images.com/endgame.jpg', '2019-04-26', 'https://trailers.com/endgame', 'https://films.com/endgame', TRUE, TRUE, 299.00),
    ('Титаник', 'Молодая аристократка влюбляется в бедного художника на борту роскошного корабля "Титаник".', 'https://images.com/titanic.jpg', '1997-12-19', 'https://trailers.com/titanic', 'https://films.com/titanic', TRUE, FALSE, 0.00),
    ('Интерстеллар', 'Команда исследователей путешествует через червоточину в космосе в попытке обеспечить выживание человечества.', 'https://images.com/interstellar.jpg', '2014-11-07', 'https://trailers.com/interstellar', 'https://films.com/interstellar', TRUE, TRUE, 399.00),
    ('Джокер', 'История происхождения культового злодея из вселенной DC Comics.', 'https://images.com/joker.jpg', '2019-10-04', 'https://trailers.com/joker', 'https://films.com/joker', TRUE, TRUE, 249.00),
    ('Форрест Гамп', 'История жизни Форреста Гампа — слабоумного, но добросердечного человека из Алабамы.', 'https://images.com/gump.jpg', '1994-07-06', 'https://trailers.com/gump', 'https://films.com/gump', TRUE, FALSE, 0.00),
    ('Чёрная пантера', 'ТЧалла возвращается домой в изолированную высокотехнологичную африканскую нацию Ваканду.', 'https://images.com/panther.jpg', '2018-02-16', 'https://trailers.com/panther', 'https://films.com/panther', TRUE, TRUE, 349.00),
    ('Безумный Макс: Дорога ярости', 'В постапокалиптической пустоши женщина восстаёт против тирана и пытается освободить группу девушек.', 'https://images.com/madmax.jpg', '2015-05-15', 'https://trailers.com/madmax', 'https://films.com/madmax', TRUE, FALSE, 0.00),
    ('Ла-Ла Ленд', 'Мия, начинающая актриса, подаёт кофе звёздам Голливуда между прослушиваниями, а Себастьян — джазовый музыкант.', 'https://images.com/lalaland.jpg', '2016-12-09', 'https://trailers.com/lalaland', 'https://films.com/lalaland', TRUE, TRUE, 199.00),
    ('Паразиты', 'Семья Ки-тхэков балансирует на грани бедности. Однажды сын получает рекомендацию устроиться репетитором.', 'https://images.com/parasite.jpg', '2019-05-30', 'https://trailers.com/parasite', 'https://films.com/parasite', TRUE, TRUE, 279.00);

-- Связываем фильмы с жанрами
INSERT INTO film_genres (film_id, genre_id) VALUES
    (1, 4), (1, 7), (1, 9), -- Начало: Фантастика, Триллер, Приключения
    (2, 1), (2, 4), (2, 9), -- Мстители: Боевик, Фантастика, Приключения
    (3, 3), (3, 6),         -- Титаник: Драма, Мелодрама
    (4, 4), (4, 3), (4, 9), -- Интерстеллар: Фантастика, Драма, Приключения
    (5, 3), (5, 7), (5, 8), -- Джокер: Драма, Триллер, Детектив
    (6, 3), (6, 2),         -- Форрест Гамп: Драма, Комедия
    (7, 1), (7, 4), (7, 9), -- Чёрная пантера: Боевик, Фантастика, Приключения
    (8, 1), (8, 4), (8, 9), -- Безумный Макс: Боевик, Фантастика, Приключения
    (9, 6), (9, 3), (9, 2), -- Ла-Ла Ленд: Мелодрама, Драма, Комедия
    (10, 3), (10, 7), (10, 2); -- Паразиты: Драма, Триллер, Комедия

-- Связываем фильмы с актёрами
INSERT INTO film_actors (film_id, actor_id, role) VALUES
    (1, 1, 'Дом Кобб'),
    (3, 1, 'Джек Доусон'),
    (4, 1, 'Купер'),
    (2, 3, 'Тони Старк/Железный человек'),
    (2, 2, 'Наташа Романофф/Чёрная вдова'),
    (6, 7, 'Форрест Гамп'),
    (8, 8, 'Фуриоза'),
    (9, 10, 'Мия'),
    (7, 9, 'ТЧалла/Чёрная пантера');

-- Добавляем отзывы
INSERT INTO reviews (rating, text, user_id, film_id, is_approved) VALUES
    (10, 'Невероятный фильм! Кристофер Нолан - гений кинематографа.', 1, 1, TRUE),
    (9, 'Отличное завершение саги о Мстителях. Много эмоций и слёз.', 2, 2, TRUE),
    (8, 'Классический фильм о любви. ДиКаприо великолепен.', 3, 3, TRUE),
    (10, 'Космическая одиссея, которая заставляет задуматься о жизни.', 4, 4, TRUE),
    (9, 'Хоакин Феникс создал незабываемого персонажа.', 5, 5, TRUE),
    (10, 'Фильм, который нужно пересматривать. Каждый раз находишь что-то новое.', 1, 6, TRUE),
    (8, 'Визуально потрясающий фильм с отличной хореографией боёв.', 2, 8, TRUE),
    (9, 'Музыкальная сказка для взрослых. Эмма Стоун просто обворожительна.', 3, 9, TRUE),
    (10, 'Социальная драма, которая актуальна во все времена.', 4, 10, FALSE);

-- Добавляем тарифные планы
INSERT INTO subscription_plans (name, description, price, duration_days) VALUES
    ('Месячная подписка', 'Доступ ко всем фильмам на 30 дней', 350.00, 30),
    ('Квартальная подписка', 'Доступ ко всем фильмам на 90 дней. Экономия 15%!', 900.00, 90),
    ('Годовая подписка', 'Доступ ко всем фильмам на 365 дней. Максимальная экономия!', 3000.00, 365);

-- Добавляем подписки
INSERT INTO subscriptions (user_id, plan_id, expires_at) VALUES
    (1, 1, '2024-12-31 23:59:59'),
    (2, 2, '2024-06-30 23:59:59'),
    (4, 3, '2025-01-15 23:59:59');

-- Добавляем избранное
INSERT INTO user_favorites (user_id, film_id) VALUES
    (1, 1),
    (1, 4),
    (2, 2),
    (2, 9),
    (3, 3),
    (4, 5),
    (5, 6);

-- Добавляем историю просмотров
INSERT INTO watch_history (user_id, film_id, progress) VALUES
    (1, 1, 100),
    (1, 4, 85),
    (2, 2, 100),
    (2, 9, 60),
    (3, 3, 100),
    (3, 8, 45),
    (4, 5, 100),
    (5, 6, 100);

-- Добавляем купленные фильмы
INSERT INTO user_purchased_films (user_id, film_id, order_id) VALUES
    (1, 1, 1),
    (1, 4, 2),
    (2, 2, 3),
    (2, 9, 4),
    (3, 3, 5),
    (4, 5, 6),
    (5, 6, 7); 