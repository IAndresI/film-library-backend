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
} from '../controllers/filmController';
import { uploadFilmImage, uploadFilmMedia } from '../middlewares/upload';

const router = Router();

// Публичные роуты
router.get('/', getFilms);
router.get('/search', searchFilms);
router.get('/:id', getFilmById);

// Админские роуты
router.get('/admin/all', getAllFilms);
router.get('/admin/:id', getFilmByIdAdmin);
router.post('/', uploadFilmImage, createFilm);
router.put('/:id/data', uploadFilmImage, updateFilmData);
router.put('/:id/media', uploadFilmMedia, updateFilmMedia);
router.delete('/:id', deleteFilm);
router.patch('/:id/toggle-visibility', toggleFilmVisibility);

export default router;
