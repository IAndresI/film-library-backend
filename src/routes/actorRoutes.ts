import { Router } from 'express';
import {
  getActors,
  getAllActors,
  getActorById,
  getActorByIdAdmin,
  createActor,
  updateActor,
  deleteActor,
  searchActors,
  toggleActorVisibility,
} from '../controllers/actorController';
import { uploadActorImage } from '../middlewares/upload';
import { requireAdmin } from '../middlewares/authMiddleware';

const router = Router();

// Публичные роуты
router.get('/', getActors);
router.get('/search', searchActors);
router.get('/:id', getActorById);

// Админские роуты
router.get('/admin/all', requireAdmin, getAllActors);
router.get('/admin/:id', requireAdmin, getActorByIdAdmin);
router.post('/', requireAdmin, uploadActorImage, createActor);
router.put('/:id', requireAdmin, uploadActorImage, updateActor);
router.delete('/:id', requireAdmin, deleteActor);
router.patch('/:id/toggle-visibility', requireAdmin, toggleActorVisibility);

export default router;
