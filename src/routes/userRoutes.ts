import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  editUser,
  getUserFavorites,
  addToFavorites,
  removeFromFavorites,
  getUserWatchHistory,
} from '../controllers/userController';

const router = Router();

// Основные операции с пользователями
router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', editUser);

// Избранное
router.get('/:id/favorites', getUserFavorites);
router.post('/:id/favorites', addToFavorites);
router.delete('/:id/favorites/:filmId', removeFromFavorites);

// История просмотров
router.get('/:id/history', getUserWatchHistory);

export default router;
