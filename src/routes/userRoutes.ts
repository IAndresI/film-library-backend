import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  editUser,
  deleteUser,
  getUserFavorites,
  getUserFavoriteIds,
  addToFavorites,
  removeFromFavorites,
  checkFavoriteStatus,
  getUserWatchHistory,
} from '../controllers/userController';
import { uploadUserAvatar } from '../middlewares/upload';
import { requireAdmin } from '../middlewares/authMiddleware';

const router = Router();

// Админские операции с пользователями
router.get('/', requireAdmin, getUsers); // Только админы могут просматривать всех пользователей
router.post('/', requireAdmin, uploadUserAvatar, createUser); // Только админы создают пользователей
router.delete('/:id', requireAdmin, deleteUser); // Только админы удаляют пользователей

// Пользовательские операции
router.get('/:id', getUserById);
router.put('/:id', uploadUserAvatar, editUser);

// Избранное
router.get('/:id/favorites', getUserFavorites);
router.get('/:id/favorites/ids', getUserFavoriteIds);
router.get('/:id/favorites/:filmId', checkFavoriteStatus);
router.post('/:id/favorites', addToFavorites);
router.delete('/:id/favorites/:filmId', removeFromFavorites);

// История просмотров
router.get('/:id/history', getUserWatchHistory);

export default router;
