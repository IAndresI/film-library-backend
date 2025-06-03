import { db } from '../db/connection';
import { otpCodes } from '../schema';
import { eq, and, lt } from 'drizzle-orm';
import { emailService } from './emailService';

export class OTPService {
  // Генерируем 6-значный код
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Отправляем OTP код на email
  async sendOTP(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Очищаем старые коды для этого email
      await this.cleanupExpiredCodes(email);

      // Проверяем лимит попыток (не более 3 кодов в час)
      const recentCodes = await db
        .select()
        .from(otpCodes)
        .where(
          and(
            eq(otpCodes.email, email),
            lt(otpCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000)), // последний час
          ),
        );

      if (recentCodes.length >= 3) {
        return {
          success: false,
          message: 'Превышен лимит запросов. Попробуйте через час.',
        };
      }

      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

      // Сохраняем код в БД
      await db.insert(otpCodes).values({
        email,
        code,
        expiresAt,
      });

      // Отправляем email
      await emailService.sendOTP(email, code);

      return {
        success: true,
        message: 'Код отправлен на ваш email',
      };
    } catch (error) {
      console.error('Ошибка отправки OTP:', error);
      return {
        success: false,
        message: 'Ошибка отправки кода. Попробуйте позже.',
      };
    }
  }

  // Проверяем OTP код
  async verifyOTP(
    email: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Ищем действующий код
      const otpRecord = await db
        .select()
        .from(otpCodes)
        .where(
          and(
            eq(otpCodes.email, email),
            eq(otpCodes.code, code),
            eq(otpCodes.isUsed, false),
          ),
        )
        .limit(1);

      if (otpRecord.length === 0) {
        return {
          success: false,
          message: 'Неверный код',
        };
      }

      const otp = otpRecord[0];

      // Проверяем срок действия
      if (new Date() > otp.expiresAt) {
        return {
          success: false,
          message: 'Код истёк',
        };
      }

      // Проверяем количество попыток
      if (otp?.attempts && otp.attempts >= 3) {
        return {
          success: false,
          message: 'Превышено количество попыток',
        };
      }

      // Увеличиваем счётчик попыток
      await db
        .update(otpCodes)
        .set({
          attempts: otp.attempts ? otp.attempts + 1 : 1,
          isUsed: true,
        })
        .where(eq(otpCodes.id, otp.id));

      return {
        success: true,
        message: 'Код подтверждён',
      };
    } catch (error) {
      console.error('Ошибка проверки OTP:', error);
      return {
        success: false,
        message: 'Ошибка проверки кода',
      };
    }
  }

  // Очищаем истёкшие коды
  private async cleanupExpiredCodes(email?: string): Promise<void> {
    try {
      const conditions = [lt(otpCodes.expiresAt, new Date())];

      if (email) {
        conditions.push(eq(otpCodes.email, email));
      }

      await db.delete(otpCodes).where(and(...conditions));
    } catch (error) {
      console.error('Ошибка очистки кодов:', error);
    }
  }

  // Запускаем периодическую очистку старых кодов
  startCleanupSchedule(): void {
    // Очистка каждый час
    setInterval(
      () => {
        this.cleanupExpiredCodes();
      },
      60 * 60 * 1000,
    );
  }
}

export const otpService = new OTPService();
