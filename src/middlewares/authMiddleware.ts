import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwtService';

// Расширяем интерфейс Request для добавления user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email: string;
        isAdmin: boolean;
      };
    }
  }
}

// Middleware для проверки аутентификации
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Токен не предоставлен',
      });
    }

    const payload = jwtService.verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: 'Недействительный токен',
      });
    }

    // Добавляем данные пользователя в запрос
    req.user = payload;
    next();
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
};

// Middleware для проверки прав администратора
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Недостаточно прав доступа',
    });
  }
  next();
};

// Опциональная аутентификация (не выдаёт ошибку, если токена нет)
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const payload = jwtService.verifyToken(token);
      if (payload) {
        req.user = payload;
      }
    }

    next();
  } catch (error) {
    // Игнорируем ошибки при опциональной аутентификации
    next();
  }
};
