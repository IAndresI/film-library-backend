import express from 'express';
import filmRoutes from './routes/filmRoutes';
import genreRoutes from './routes/genreRoutes';
import userRoutes from './routes/userRoutes';
import reviewRoutes from './routes/reviewRoutes';
import { errorHandler } from './middlewares/errorHandler';
import authRoutes from './routes/authRoutes';

const app = express();

app.use(express.json());

// Routes
app.use('/api/films', filmRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/auth', authRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;
