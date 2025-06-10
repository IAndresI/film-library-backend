import { Router } from 'express';
import {
  getAllReviews,
  getPendingReviews,
  getUserReviews,
  getUserFilmReview,
  createReview,
  updateReview,
  approveReview,
  rejectReview,
  deleteReview,
  getReviewsByFilm,
} from '../controllers/reviewController';
import { requireAdmin } from '../middlewares/authMiddleware';

const router = Router();

// Публичные роуты
router.get('/film/:filmId', getReviewsByFilm);
router.get('/user/:userId', getUserReviews);
router.get('/user/:userId/film/:filmId', getUserFilmReview);
router.post('/', createReview);
router.put('/:id', updateReview);

// Админские роуты
router.get('/', requireAdmin, getAllReviews);
router.get('/pending', requireAdmin, getPendingReviews);
router.put('/:id/approve', requireAdmin, approveReview);
router.put('/:id/reject', requireAdmin, rejectReview);
router.delete('/:id', requireAdmin, deleteReview);

export default router;
