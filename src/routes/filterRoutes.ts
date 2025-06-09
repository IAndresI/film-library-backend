import { Router } from 'express';
import {
  getFilmsForFilters,
  getActorsForFilters,
  getGenresForFilters,
  getAllFiltersData,
  getAllFiltersDataAdmin,
} from '../controllers/filterController';

const router = Router();

// Получить фильмы для фильтров
router.get('/films', getFilmsForFilters);

// Получить актёров для фильтров
router.get('/actors', getActorsForFilters);

// Получить жанры для фильтров
router.get('/genres', getGenresForFilters);

// Получить все данные для фильтров одним запросом
router.get('/all', getAllFiltersData);

// Получить все данные для фильтров одним запросом (для админов)
router.get('/all/admin', getAllFiltersDataAdmin);

export default router;
