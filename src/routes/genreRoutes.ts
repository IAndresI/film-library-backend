import { Router } from 'express';
import {
  getGenres,
  getGenreById,
  createGenre,
  updateGenre,
  deleteGenre,
} from '../controllers/genreController';
import { requireAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', getGenres);
router.get('/:id', getGenreById);
router.post('/', requireAdmin, createGenre);
router.put('/:id', requireAdmin, updateGenre);
router.delete('/:id', requireAdmin, deleteGenre);

export default router;
