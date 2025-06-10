import { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import { otpService } from '../services/otpService';
import { jwtService } from '../services/jwtService';
import { paymentService } from '../services/paymentService';

// Отправка OTP кода
export const sendOTP = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email обязателен',
      });
      return;
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: 'Неверный формат email',
      });
      return;
    }

    const result = await otpService.sendOTP(email.toLowerCase());

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Ошибка отправки OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
};

// Проверка OTP и авторизация
export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      res.status(400).json({
        success: false,
        message: 'Email и код обязательны',
      });
      return;
    }

    const verifyResult = await otpService.verifyOTP(email.toLowerCase(), code);

    if (!verifyResult.success) {
      res.status(400).json(verifyResult);
      return;
    }

    // Ищем существующего пользователя
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Если пользователя нет, создаём его
    if (user.length === 0) {
      const newUser = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          name: email.split('@')[0], // временное имя
        })
        .returning();

      user = newUser;
    }

    const userData = user[0];

    // Генерируем JWT токен
    const token = jwtService.generateToken({
      userId: userData.id,
      email: userData.email,
      isAdmin: userData.isAdmin || false,
    });

    // Получаем подписку пользователя
    const subscription = await paymentService.getUserSubscription(userData.id);

    res.status(200).json({
      token,
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        avatar: userData.avatar,
        createdAt: userData.createdAt,
        isAdmin: userData.isAdmin,
        subscription: subscription || null,
      },
    });
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
};

// Проверка токена (refresh)
export const verifyToken = async (req: Request, res: Response) => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Токен не предоставлен',
      });
      return;
    }

    const payload = jwtService.verifyToken(token);

    if (!payload) {
      res.status(401).json({
        success: false,
        message: 'Недействительный токен',
      });
      return;
    }

    // Проверяем, существует ли пользователь
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (user.length === 0) {
      res.status(401).json({
        success: false,
        message: 'Пользователь не найден',
      });
      return;
    }

    const userData = user[0];

    // Получаем подписку пользователя
    const subscription = await paymentService.getUserSubscription(userData.id);

    res.status(200).json({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      avatar: userData.avatar,
      isAdmin: userData.isAdmin,
      subscription: subscription || null,
    });
  } catch (error) {
    console.error('Ошибка проверки токена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
};

// Получить текущего авторизованного пользователя
export const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Получаем свежие данные пользователя из БД
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatar: users.avatar,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);

    if (user.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
      return;
    }

    const userData = user[0];

    // Получаем подписку пользователя
    const subscription = await paymentService.getUserSubscription(userData.id);

    res.status(200).json({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      avatar: userData.avatar,
      createdAt: userData.createdAt,
      isAdmin: userData.isAdmin,
      subscription: subscription || null,
    });
  } catch (error) {
    next(error);
  }
};
