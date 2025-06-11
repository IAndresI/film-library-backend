import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  getOrderByIdAdmin,
  getUserOrders,
  createOrder,
  updateOrder,
  deleteOrder,
} from '../controllers/orderController';
import { requireAdmin } from '../middlewares/authMiddleware';

const router = Router();

// Админские операции с заказами
router.get('/', requireAdmin, getOrders); // Только админы могут просматривать все заказы
router.put('/:id', requireAdmin, updateOrder); // Только админы могут обновлять заказы
router.delete('/:id', requireAdmin, deleteOrder); // Только админы могут удалять заказы
router.get('/admin/:id', requireAdmin, requireAdmin, getOrderByIdAdmin); // Админский просмотр конкретного заказа

// Пользовательские операции
router.get('/user/:userId', getUserOrders); // Заказы пользователя
router.get('/:id', getOrderById); // Конкретный заказ

// Создание заказов
router.post('/subscription', createOrder); // Создать заказ на подписку
router.post('/film', createOrder); // Создать заказ на фильм

export default router;
