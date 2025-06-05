import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  getUserOrders,
  createOrder,
  updateOrder,
  deleteOrder,
} from '../controllers/orderController';

const router = Router();

// CRUD операции с заказами
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.get('/user/:userId', getUserOrders);
router.post('/', createOrder);
router.put('/:id', updateOrder);
router.delete('/:id', deleteOrder);

export default router;
