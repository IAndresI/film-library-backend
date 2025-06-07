import { Request, Response, NextFunction } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/connection';
import { users, userFavorites, films, watchHistory } from '../schema';
import { deleteFile } from '../utils/fileUtils';
import { paymentService } from '../services/paymentService';

// Получить всех пользователей
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    // Добавляем подписку для каждого пользователя
    const usersWithSubscriptions = await Promise.all(
      allUsers.map(async (user) => {
        const subscription = await paymentService.getUserSubscription(user.id);
        return {
          ...user,
          subscription: subscription || null,
        };
      }),
    );

    res.json(usersWithSubscriptions);
  } catch (error) {
    next(error);
  }
};

// Получить пользователя по ID
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    const user = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    // Получаем подписку пользователя
    const subscription = await paymentService.getUserSubscription(user[0].id);

    res.json({
      ...user[0],
      subscription: subscription || null,
    });
  } catch (error) {
    next(error);
  }
};

// Создать пользователя
export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, email } = req.body;

    // Получаем путь к загруженному аватару
    let avatar = req.body.avatar; // URL из поля формы если есть
    if (req.file) {
      avatar = `/${req.file.path.replace(/\\/g, '/')}`;
    }

    const newUser = await db
      .insert(users)
      .values({ name, email, avatar })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      });

    // Получаем подписку нового пользователя (будет null)
    const subscription = await paymentService.getUserSubscription(
      newUser[0].id,
    );

    res.status(201).json({
      ...newUser[0],
      subscription: subscription || null,
    });
  } catch (error) {
    next(error);
  }
};

// Редактировать пользователя
export const editUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name } = req.body;

    // Получаем старые данные
    const existingUser = await db
      .select({ avatar: users.avatar })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existingUser[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    // Готовим объект для обновления
    const updateData: { name: string; avatar?: string | null } = { name };

    // Обрабатываем аватар
    if (req.file) {
      // Если передан новый файл - загружаем его
      if (existingUser[0].avatar) {
        deleteFile(existingUser[0].avatar);
      }
      updateData.avatar = `/${req.file.path.replace(/\\/g, '/')}`;
    } else if (req.body.avatar === 'null') {
      // Если передана строка "null" - удаляем текущий аватар
      if (existingUser[0].avatar) {
        deleteFile(existingUser[0].avatar);
      }
      updateData.avatar = null;
    } else if (req.body.avatar) {
      // Если передан URL - устанавливаем его
      updateData.avatar = req.body.avatar;
    }
    // Если поле avatar не передано вообще - не трогаем текущий аватар

    const updatedUser = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      });

    // Получаем подписку обновленного пользователя
    const subscription = await paymentService.getUserSubscription(
      updatedUser[0].id,
    );

    res.json({
      ...updatedUser[0],
      subscription: subscription || null,
    });
  } catch (error) {
    next(error);
  }
};

// Получить избранные фильмы пользователя
export const getUserFavorites = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const favorites = await db
      .select({
        id: films.id,
        name: films.name,
        description: films.description,
        image: films.image,
        releaseDate: films.releaseDate,
        trailerUrl: films.trailerUrl,
        filmUrl: films.filmUrl,
        addedAt: userFavorites.createdAt,
      })
      .from(films)
      .innerJoin(userFavorites, eq(films.id, userFavorites.filmId))
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));

    res.json(favorites);
  } catch (error) {
    next(error);
  }
};

// Добавить фильм в избранное
export const addToFavorites = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { filmId } = req.body;

    const newFavorite = await db
      .insert(userFavorites)
      .values({ userId, filmId })
      .returning();

    res.status(201).json(newFavorite[0]);
  } catch (error) {
    next(error);
  }
};

// Удалить из избранного
export const removeFromFavorites = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const filmId = parseInt(req.params.filmId, 10);

    const deleted = await db
      .delete(userFavorites)
      .where(
        and(eq(userFavorites.userId, userId), eq(userFavorites.filmId, filmId)),
      )
      .returning();

    if (!deleted[0]) {
      res.status(404).json({ message: 'Запись не найдена' });
      return;
    }

    res.json({ message: 'Удалено из избранного' });
  } catch (error) {
    next(error);
  }
};

// Получить историю просмотров пользователя
export const getUserWatchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const history = await db
      .select({
        id: watchHistory.id,
        filmId: films.id,
        filmName: films.name,
        filmImage: films.image,
        progress: watchHistory.progress,
        watchedAt: watchHistory.watchedAt,
      })
      .from(watchHistory)
      .innerJoin(films, eq(watchHistory.filmId, films.id))
      .where(eq(watchHistory.userId, userId))
      .orderBy(desc(watchHistory.watchedAt));

    res.json(history);
  } catch (error) {
    next(error);
  }
};

// Удалить пользователя
export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Получаем данные пользователя перед удалением для удаления медиа файлов
    const userToDelete = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!userToDelete[0]) {
      res.status(404).json({ message: 'Пользователь не найден' });
      return;
    }

    // Удаляем аватар пользователя
    if (userToDelete[0].avatar) {
      deleteFile(userToDelete[0].avatar);
    }

    const deletedUser = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    res.json(deletedUser[0]);
  } catch (error) {
    next(error);
  }
};
