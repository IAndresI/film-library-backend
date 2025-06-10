import express from 'express';
import cors from 'cors';
import filmRoutes from './routes/filmRoutes';
import genreRoutes from './routes/genreRoutes';
import userRoutes from './routes/userRoutes';
import reviewRoutes from './routes/reviewRoutes';
import orderRoutes from './routes/orderRoutes';
import actorRoutes from './routes/actorRoutes';
import filterRoutes from './routes/filterRoutes';
import { errorHandler } from './middlewares/errorHandler';
import authRoutes from './routes/authRoutes';
import paymentRoutes from './routes/paymentRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import { authenticate } from './middlewares/authMiddleware';

const app = express();

// CORS настройка
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
);

app.use(express.json());

// Раздача статики
app.use('/uploads', express.static('uploads'));

// Роуты без авторизации (только auth)
app.use('/api/auth', authRoutes);

// Гибридные роуты
app.use('/api/payments', paymentRoutes);

// Все остальные роуты требуют авторизации
app.use('/api', authenticate);

// Защищенные роуты
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/films', filmRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/actors', actorRoutes);
app.use('/api/filters', filterRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;
