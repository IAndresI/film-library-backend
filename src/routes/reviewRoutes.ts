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

const router = Router();

// Публичные роуты
router.get('/film/:filmId', getReviewsByFilm);
router.get('/user/:userId', getUserReviews);
router.get('/user/:userId/film/:filmId', getUserFilmReview);
router.post('/', createReview);
router.put('/:id', updateReview);

// Админские роуты
router.get('/', getAllReviews);
router.get('/pending', getPendingReviews);
router.put('/:id/approve', approveReview);
router.put('/:id/reject', rejectReview);
router.delete('/:id', deleteReview);

export default router;
