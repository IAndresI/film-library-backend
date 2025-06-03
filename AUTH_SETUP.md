# Настройка аутентификации через Email OTP

## Описание системы

Реализована простая аутентификация через одноразовые коды (OTP), отправляемые на email. Без регистрации - пользователь создаётся автоматически при первом входе.

## Установка зависимостей

```bash
npm install nodemailer jsonwebtoken
npm install -D @types/nodemailer @types/jsonwebtoken
```

## Настройка переменных окружения

Скопируй `env.example` в `.env` и настрой:

```env
# JWT
JWT_SECRET=твой-секретный-ключ-для-jwt
JWT_EXPIRES_IN=7d

# Email настройки для Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=твой-email@gmail.com
SMTP_PASS=пароль-приложения-gmail
SMTP_FROM=Film Library <твой-email@gmail.com>
```

### Настройка Gmail для отправки писем

1. Включи двухфакторную аутентификацию в Google аккаунте
2. Перейди в настройки Google → Безопасность → Пароли приложений
3. Создай новый пароль приложения для "Почта"
4. Используй этот пароль в `SMTP_PASS`

## API Endpoints

### Отправка OTP кода

```
POST /api/auth/send-otp
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Проверка OTP и получение токена

```
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"
}
```

### Проверка токена

```
GET /api/auth/verify-token
Authorization: Bearer jwt-token
```

## Принцип работы

1. **Отправка кода**: Пользователь вводит email → получает 6-значный код на почту (действует 10 минут)
2. **Авторизация**: Вводит код → получает JWT токен
3. **Автосоздание**: Если пользователя нет в БД, он создаётся автоматически с именем = email до @
4. **Безопасность**:
   - Максимум 3 кода в час на email
   - Максимум 3 попытки ввода на код
   - Автоочистка истёкших кодов

## Использование в коде

### Middleware аутентификации

```typescript
import {
  authenticate,
  requireAdmin,
  optionalAuth,
} from './middlewares/authMiddleware';

// Обязательная аутентификация
router.get('/profile', authenticate, (req, res) => {
  // req.user содержит { userId, email, isAdmin }
});

// Только для админов
router.post('/admin/action', authenticate, requireAdmin, (req, res) => {
  // Только авторизованные админы
});

// Опциональная аутентификация
router.get('/public', optionalAuth, (req, res) => {
  // req.user может быть undefined
});
```

### Обновление других контроллеров

Добавь проверки в существующие контроллеры:

```typescript
// Только для авторизованных
router.post('/favorites', authenticate, userController.addToFavorites);

// Только для админов
router.post('/films', authenticate, requireAdmin, filmController.create);

// Опционально (показывать разный контент)
router.get('/films', optionalAuth, filmController.getAll);
```

## Интеграция в main app

```typescript
import authRoutes from './routes/authRoutes';
import { otpService } from './services/otpService';

// Подключаем роуты
app.use('/api/auth', authRoutes);

// Запускаем очистку старых OTP кодов
otpService.startCleanupSchedule();
```

## База данных

Создана таблица `otp_codes`:

- Автоматическая очистка истёкших кодов
- Защита от спама (лимиты по времени)
- Счётчик попыток ввода

## Что дальше

1. Скопируй `env.example` в `.env`
2. Настрой Gmail или другой SMTP
3. Добавь зависимости
4. Подключи роуты в main app
5. Добавь middleware в нужные роуты
