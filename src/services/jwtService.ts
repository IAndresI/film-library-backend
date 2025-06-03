import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

export class JWTService {
  private readonly secretKey: string;
  private readonly expiresIn: string;

  constructor() {
    this.secretKey =
      process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  }

  // Создаём токен
  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.secretKey, {
      expiresIn: this.expiresIn,
    } as jwt.SignOptions);
  }

  // Проверяем токен
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secretKey) as TokenPayload;
      return decoded;
    } catch (error) {
      console.error('Ошибка проверки токена:', error);
      return null;
    }
  }

  // Извлекаем токен из заголовка Authorization
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}

export const jwtService = new JWTService();
