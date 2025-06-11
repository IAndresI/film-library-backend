import { Router } from 'express';
import {
  getFilms,
  getAllFilms,
  getFilmById,
  getFilmByIdAdmin,
  createFilm,
  updateFilmData,
  updateFilmMedia,
  deleteFilm,
  searchFilms,
  toggleFilmVisibility,
  getUserPurchasedFilms,
} from '../controllers/filmController';
import { uploadFilmImage, uploadFilmMedia } from '../middlewares/upload';
import { requireAdmin, authenticate } from '../middlewares/authMiddleware';

const router = Router();

// Публичные роуты (для авторизованных пользователей)
router.get('/', getFilms);
router.get('/search', searchFilms);
router.get('/purchased', getUserPurchasedFilms);
router.get('/:id', getFilmById);

// Админские роуты
router.get('/admin/all', requireAdmin, getAllFilms);
router.get('/admin/:id', requireAdmin, getFilmByIdAdmin);
router.post('/', requireAdmin, uploadFilmImage, createFilm);
router.put('/:id/data', requireAdmin, uploadFilmImage, updateFilmData);
router.put('/:id/media', requireAdmin, uploadFilmMedia, updateFilmMedia);
router.delete('/:id', requireAdmin, deleteFilm);
router.patch('/:id/toggle-visibility', requireAdmin, toggleFilmVisibility);

export default router;
