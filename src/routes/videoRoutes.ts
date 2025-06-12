import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from '../db/connection';
import { films } from '../schema';
import { eq } from 'drizzle-orm';
import { jwtService } from '../services/jwtService';
import { paymentService } from '../services/paymentService';
import { authenticate, requireAdmin } from '../middlewares/authMiddleware';

const router = Router();

// Кэш активных токенов (tokenId -> данные)
interface ActiveTokenData {
  userId: number;
  filmId: number;
  expiresAt: number;
  originalToken: string;
}

const activeTokens = new Map<string, ActiveTokenData>();

// Очистка истекших токенов каждые 30 минут
setInterval(
  () => {
    const now = Date.now();
    for (const [tokenId, data] of activeTokens.entries()) {
      if (data.expiresAt < now) {
        activeTokens.delete(tokenId);
      }
    }
  },
  30 * 60 * 1000,
);

const allowedOrigins = ['http://localhost:5173'];

const validateOrigin = (req: Request) => {
  const origin = req.headers.origin || req.headers.referer;
  return allowedOrigins.some((allowed) => origin?.startsWith(allowed));
};

// Стриминг видео по ID фильма
router.get('/:filmId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filmId } = req.params;
    const token = req.query.token as string;

    if (!validateOrigin(req)) {
      res.status(403).json({
        error: 'Доступ запрещен',
        message: 'Стриминг доступен только с разрешенного домена',
      });
      return;
    }

    if (!token) {
      res.status(401).json({ error: 'Токен не предоставлен' });
      return;
    }

    let userId: number;
    let isTemporaryToken = false;

    // Сначала пробуем как временный токен
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

      if (decoded.type === 'video_access') {
        // Проверяем в кэше активных токенов (если есть tokenId)
        if (decoded.tokenId) {
          const activeToken = activeTokens.get(decoded.tokenId);

          if (activeToken) {
            // Токен найден в кэше - используем данные из кэша
            if (activeToken.expiresAt < Date.now()) {
              res.status(401).json({ error: 'Токен истек' });
              return;
            }

            if (activeToken.filmId !== parseInt(filmId)) {
              res
                .status(403)
                .json({ error: 'Токен не подходит для этого фильма' });
              return;
            }

            userId = activeToken.userId;
            isTemporaryToken = true;
          } else {
            // Токен не найден в кэше - проверяем оригинальный
            if (decoded.exp < Date.now()) {
              res.status(401).json({ error: 'Токен истек' });
              return;
            }

            if (decoded.filmId !== parseInt(filmId)) {
              res
                .status(403)
                .json({ error: 'Токен не подходит для этого фильма' });
              return;
            }

            userId = decoded.userId;
            isTemporaryToken = true;
          }
        } else {
          // Старый формат токена без tokenId
          if (decoded.exp < Date.now()) {
            res.status(401).json({ error: 'Токен истек' });
            return;
          }

          if (decoded.filmId !== parseInt(filmId)) {
            res
              .status(403)
              .json({ error: 'Токен не подходит для этого фильма' });
            return;
          }

          userId = decoded.userId;
          isTemporaryToken = true;
        }
      } else {
        throw new Error('Не временный токен');
      }
    } catch {
      // Если не временный токен, пробуем как обычный JWT
      const payload = jwtService.verifyToken(token);
      if (!payload) {
        res.status(401).json({ error: 'Недействительный токен' });
        return;
      }
      userId = payload.userId;
    }

    // Получаем данные фильма из базы
    const film = await db
      .select({ filmUrl: films.filmUrl, isPaid: films.isPaid })
      .from(films)
      .where(eq(films.id, parseInt(filmId)))
      .limit(1);

    if (!film[0] || !film[0].filmUrl) {
      res.status(404).json({ error: 'Видео не найдено' });
      return;
    }

    // Проверка доступа к платному контенту
    if (film[0].isPaid) {
      // Проверяем доступ пользователя из токена к этому фильму
      const hasActiveSubscription =
        await paymentService.hasActiveSubscription(userId);
      const hasPurchasedFilm = await paymentService.hasUserPurchasedFilm(
        userId,
        parseInt(filmId),
      );

      if (!hasActiveSubscription && !hasPurchasedFilm) {
        res.status(403).json({
          error: 'Доступ запрещен',
          message: `Пользователь ${userId} не имеет доступа к фильму ${filmId}. Требуется активная подписка или покупка фильма`,
          isPaid: true,
          userId,
          filmId: parseInt(filmId),
        });
        return;
      }
    }

    // Убираем /uploads/ из начала пути если есть
    const videoUrl = film[0].filmUrl.startsWith('/uploads/')
      ? film[0].filmUrl.slice(9)
      : film[0].filmUrl;

    const videoPath = path.join(process.cwd(), 'uploads', videoUrl);

    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Видео файл не найден' });
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Range request для перематывания
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const file = fs.createReadStream(videoPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache',
      });

      file.pipe(res);
    } else {
      // Полная отдача файла
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });

      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Ошибка стриминга видео:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

const expiredTime = 2 * 60 * 60 * 1000;

// Генерация временного токена для видео
router.post(
  '/token/:filmId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filmId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Не авторизован' });
        return;
      }

      // Получаем данные фильма
      const film = await db
        .select({ isPaid: films.isPaid, name: films.name })
        .from(films)
        .where(eq(films.id, parseInt(filmId)))
        .limit(1);

      if (!film[0]) {
        res.status(404).json({ error: 'Фильм не найден' });
        return;
      }

      // Проверка доступа к платному контенту (та же логика)
      if (film[0].isPaid) {
        const hasActiveSubscription =
          await paymentService.hasActiveSubscription(userId);
        const hasPurchasedFilm = await paymentService.hasUserPurchasedFilm(
          userId,
          parseInt(filmId),
        );

        if (!hasActiveSubscription && !hasPurchasedFilm) {
          res.status(403).json({
            error: 'Доступ запрещен',
            message:
              'Для просмотра этого фильма требуется активная подписка или покупка фильма',
            isPaid: true,
          });
          return;
        }
      }

      // Генерируем временный токен с уникальным ID
      const tokenId = `${userId}-${filmId}-${Date.now()}`;
      const expiresAt = Date.now() + expiredTime; // 2 часа
      const tempToken = Buffer.from(
        JSON.stringify({
          userId,
          filmId: parseInt(filmId),
          tokenId,
          exp: expiresAt,
          type: 'video_access',
        }),
      ).toString('base64');

      // Сохраняем в кэш активных токенов
      activeTokens.set(tokenId, {
        userId,
        filmId: parseInt(filmId),
        expiresAt,
        originalToken: tempToken,
      });

      res.json({
        token: tempToken,
        tokenId,
        filmId: parseInt(filmId),
        streamUrl: `/videos/stream/${filmId}?token=${tempToken}`,
        expiresIn: expiredTime / 1000, // секунды (2 часа)
        filmName: film[0].name,
      });
    } catch (error) {
      console.error('Ошибка генерации токена:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

// Обновление существующего токена (продление срока действия)
router.post(
  '/refresh/:filmId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filmId } = req.params;
      const { tokenId } = req.body;
      const userId = req.user?.userId;

      if (!userId || !tokenId) {
        res
          .status(400)
          .json({ error: 'Не хватает данных для обновления токена' });
        return;
      }

      // Получаем данные фильма
      const film = await db
        .select({ isPaid: films.isPaid, name: films.name })
        .from(films)
        .where(eq(films.id, parseInt(filmId)))
        .limit(1);

      if (!film[0]) {
        res.status(404).json({ error: 'Фильм не найден' });
        return;
      }

      // Проверка доступа к платному контенту
      if (film[0].isPaid) {
        const hasActiveSubscription =
          await paymentService.hasActiveSubscription(userId);
        const hasPurchasedFilm = await paymentService.hasUserPurchasedFilm(
          userId,
          parseInt(filmId),
        );

        if (!hasActiveSubscription && !hasPurchasedFilm) {
          res.status(403).json({
            error: 'Доступ запрещен',
            message:
              'Для просмотра этого фильма требуется активная подписка или покупка фильма',
            isPaid: true,
          });
          return;
        }
      }

      // Проверяем существует ли токен в кэше
      const activeToken = activeTokens.get(tokenId);
      if (!activeToken) {
        res.status(404).json({ error: 'Токен не найден или истек' });
        return;
      }

      // Проверяем что пользователь из токена совпадает с пользователем из кэша
      if (activeToken.userId !== userId) {
        res.status(403).json({
          error: 'Доступ запрещен',
          message: `Токен принадлежит другому пользователю. Токен: ${activeToken.userId}, запрос: ${userId}`,
        });
        return;
      }

      // Дополнительная проверка доступа к платному контенту при refresh
      if (film[0].isPaid) {
        const hasActiveSubscription =
          await paymentService.hasActiveSubscription(userId);
        const hasPurchasedFilm = await paymentService.hasUserPurchasedFilm(
          userId,
          parseInt(filmId),
        );

        if (!hasActiveSubscription && !hasPurchasedFilm) {
          // Удаляем токен из кэша если доступ пропал
          activeTokens.delete(tokenId);
          res.status(403).json({
            error: 'Доступ утрачен',
            message: `Пользователь ${userId} больше не имеет доступа к фильму ${filmId}`,
            isPaid: true,
            userId,
            filmId: parseInt(filmId),
          });
          return;
        }

        console.log(
          `Refresh: доступ подтвержден для пользователя ${userId}, фильм ${filmId}`,
        );
      }

      // Продлеваем срок действия в кэше - токен остается тот же!
      const newExpiresAt = Date.now() + expiredTime;
      activeTokens.set(tokenId, {
        ...activeToken,
        expiresAt: newExpiresAt,
      });

      res.json({
        tokenId,
        expiresIn: expiredTime / 1000,
        filmName: film[0].name,
        refreshed: true,
        message: 'Токен продлен, URL остается прежним',
      });
    } catch (error) {
      console.error('Ошибка обновления токена:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

// Админский роут для генерации временного токена
router.post(
  '/admin/token/:filmId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filmId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(400).json({ error: 'userId обязателен' });
        return;
      }

      // Получаем данные фильма только для имени
      const film = await db
        .select({ name: films.name })
        .from(films)
        .where(eq(films.id, parseInt(filmId)))
        .limit(1);

      if (!film[0]) {
        res.status(404).json({ error: 'Фильм не найден' });
        return;
      }

      // Генерируем временный токен с уникальным ID
      const tokenId = `${userId}-${filmId}-${Date.now()}`;
      const expiresAt = Date.now() + expiredTime;
      const tempToken = Buffer.from(
        JSON.stringify({
          userId,
          filmId: parseInt(filmId),
          tokenId,
          exp: expiresAt,
          type: 'video_access',
        }),
      ).toString('base64');

      // Сохраняем в кэш активных токенов
      activeTokens.set(tokenId, {
        userId,
        filmId: parseInt(filmId),
        expiresAt,
        originalToken: tempToken,
      });

      res.json({
        token: tempToken,
        tokenId,
        filmId: parseInt(filmId),
        streamUrl: `/videos/stream/${filmId}?token=${tempToken}`,
        expiresIn: expiredTime / 1000,
        filmName: film[0].name,
      });
    } catch (error) {
      console.error('Ошибка генерации админского токена:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

// Админский роут для обновления токена
router.post(
  '/admin/refresh/:filmId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filmId } = req.params;
      const userId = req.user?.userId;
      const { tokenId } = req.body;

      if (!userId || !tokenId) {
        res.status(400).json({ error: 'userId и tokenId обязательны' });
        return;
      }

      // Получаем данные фильма только для имени
      const film = await db
        .select({ name: films.name })
        .from(films)
        .where(eq(films.id, parseInt(filmId)))
        .limit(1);

      if (!film[0]) {
        res.status(404).json({ error: 'Фильм не найден' });
        return;
      }

      // Проверяем существует ли токен в кэше
      const activeToken = activeTokens.get(tokenId);
      if (!activeToken) {
        res.status(404).json({ error: 'Токен не найден или истек' });
        return;
      }

      // Продлеваем срок действия в кэше
      const newExpiresAt = Date.now() + expiredTime;
      activeTokens.set(tokenId, {
        ...activeToken,
        expiresAt: newExpiresAt,
      });

      res.json({
        tokenId,
        expiresIn: expiredTime / 1000,
        filmName: film[0].name,
        refreshed: true,
        message: 'Токен продлен, URL остается прежним',
      });
    } catch (error) {
      console.error('Ошибка обновления админского токена:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  },
);

export default router;
