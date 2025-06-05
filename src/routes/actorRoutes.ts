import { Router } from 'express';
import {
  getActors,
  getAllActors,
  getActorById,
  createActor,
  updateActor,
  deleteActor,
  searchActors,
  toggleActorVisibility,
} from '../controllers/actorController';
import { uploadActorImage } from '../middlewares/upload';

const router = Router();

// Публичные роуты
router.get('/', getActors);
router.get('/search', searchActors);
router.get('/:id', getActorById);

// Админские роуты
router.get('/admin/all', getAllActors);
router.post('/', uploadActorImage, createActor);
router.put('/:id', uploadActorImage, updateActor);
router.delete('/:id', deleteActor);
router.patch('/:id/toggle-visibility', toggleActorVisibility);

export default router;
