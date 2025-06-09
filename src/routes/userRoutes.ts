import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  editUser,
  deleteUser,
  getUserFavorites,
  addToFavorites,
  removeFromFavorites,
  checkFavoriteStatus,
  getUserWatchHistory,
} from '../controllers/userController';
import { uploadUserAvatar } from '../middlewares/upload';

const router = Router();

// Основные операции с пользователями
router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', uploadUserAvatar, createUser);
router.put('/:id', uploadUserAvatar, editUser);
router.delete('/:id', deleteUser);

// Избранное
router.get('/:id/favorites', getUserFavorites);
router.get('/:id/favorites/:filmId', checkFavoriteStatus);
router.post('/:id/favorites', addToFavorites);
router.delete('/:id/favorites/:filmId', removeFromFavorites);

// История просмотров
router.get('/:id/history', getUserWatchHistory);

export default router;
