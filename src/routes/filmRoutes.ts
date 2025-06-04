import { Router } from 'express';
import {
  getFilms,
  getAllFilms,
  getFilmById,
  createFilm,
  updateFilm,
  deleteFilm,
  searchFilms,
  toggleFilmVisibility,
} from '../controllers/filmController';

const router = Router();

// Публичные роуты
router.get('/', getFilms);
router.get('/search', searchFilms);
router.get('/:id', getFilmById);

// Админские роуты
router.get('/admin/all', getAllFilms);
router.post('/', createFilm);
router.put('/:id', updateFilm);
router.delete('/:id', deleteFilm);
router.patch('/:id/toggle-visibility', toggleFilmVisibility);

export default router;
