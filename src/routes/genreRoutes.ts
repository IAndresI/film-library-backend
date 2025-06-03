import { Router } from 'express';
import {
  getGenres,
  getGenreById,
  createGenre,
  updateGenre,
  deleteGenre,
} from '../controllers/genreController';

const router = Router();

router.get('/', getGenres);
router.get('/:id', getGenreById);
router.post('/', createGenre);
router.put('/:id', updateGenre);
router.delete('/:id', deleteGenre);

export default router;
