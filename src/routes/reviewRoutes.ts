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
router.put('/:id/approve', approveReview);
router.put('/:id/reject', rejectReview);
router.delete('/:id', deleteReview);

export default router;
