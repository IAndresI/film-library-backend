import { Request, Response } from 'express';
import { db } from '../db/connection';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import { otpService } from '../services/otpService';
import { jwtService } from '../services/jwtService';

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

    res.status(200).json({
      success: true,
      message: 'Авторизация успешна',
      data: {
        token,
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          avatar: userData.avatar,
          isAdmin: userData.isAdmin,
        },
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

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          avatar: userData.avatar,
          isAdmin: userData.isAdmin,
        },
      },
    });
  } catch (error) {
    console.error('Ошибка проверки токена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
};
