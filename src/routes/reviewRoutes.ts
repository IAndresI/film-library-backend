import { Router } from 'express';
import {
  getApprovedReviews,
  getAllReviews,
  getPendingReviews,
  createReview,
  approveReview,
  rejectReview,
  deleteReview,
} from '../controllers/reviewController';

const router = Router();

// Публичные роуты
router.get('/film/:filmId', getApprovedReviews);
router.post('/', createReview);

// Админские роуты
router.get('/', getAllReviews);
router.get('/pending', getPendingReviews);
router.patch('/:id/approve', approveReview);
router.delete('/:id/reject', rejectReview);
router.delete('/:id', deleteReview);

export default router;
