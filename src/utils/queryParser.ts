import { Request } from 'express';
import { desc, asc, inArray, and, ilike } from 'drizzle-orm';

export interface SortConfig {
  desc: boolean;
  id: string;
}

export interface FilterConfig {
  id: string;
  value: string[];
}

export interface PaginationParams {
  offset: number;
  limit: number;
  pageIndex: number;
  pageSize: number;
}

// Универсальная функция для парсинга массивов из query параметров
export function parseArrayParam(param: any): string[] {
  return Array.isArray(param)
    ? (param as string[])
    : param
      ? [param as string]
      : [];
}

export function parsePaginationParams(req: Request): PaginationParams {
  const pageIndex = parseInt(req.query.pageIndex as string) || 0;
  const pageSize = parseInt(req.query.pageSize as string) || 10;

  // Ограничиваем максимальный размер страницы
  const limit = Math.min(pageSize, 100);
  const offset = pageIndex * limit;

  return {
    offset,
    limit,
    pageIndex,
    pageSize: limit,
  };
}

export function parseSortParams(
  req: Request,
  selectFields: Record<string, any>,
) {
  // С extended parser структура req.query.sort уже объект
  const sort = req.query.sort as any;
  if (!sort || !Array.isArray(sort) || sort.length === 0) {
    return desc(selectFields.createdAt);
  }

  // Берем первую сортировку
  const firstSort = sort[0];
  if (!firstSort || !firstSort.id) {
    return desc(selectFields.createdAt);
  }

  const field = selectFields[firstSort.id];
  if (field) {
    return firstSort.desc === 'true' ? desc(field) : asc(field);
  }

  // По умолчанию сортировка по createdAt desc
  return desc(selectFields.createdAt);
}

export function parseFilterParams(
  req: Request,
  selectFields: Record<string, any>,
) {
  // С extended parser структура req.query.filters уже объект
  const filters = req.query.filters as any;
  if (!filters || !Array.isArray(filters)) {
    return undefined;
  }

  const whereConditions: any[] = [];

  filters.forEach((filter: any) => {
    if (!filter.id || !filter.value) return;

    const field = selectFields[filter.id];
    if (!field) return;

    // Определяем тип фильтра
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const isStringFilter =
      typeof filter.value === 'string' ||
      (Array.isArray(filter.value) &&
        filter.value.length === 1 &&
        ['name', 'email', 'description'].includes(filter.id));

    if (isStringFilter) {
      // Для строковых фильтров - поиск по подстроке
      whereConditions.push(ilike(field, `%${values[0]}%`));
    } else {
      // Для массивов - точное совпадение
      if (
        filter.id === 'isApproved' ||
        filter.id === 'isAdmin' ||
        filter.id === 'isVisible'
      ) {
        whereConditions.push(
          inArray(
            field,
            values.map((v: string) => v === 'true'),
          ),
        );
      } else if (
        filter.id === 'orderStatus' ||
        filter.id === 'subscriptionStatus'
      ) {
        whereConditions.push(inArray(field, values));
      } else {
        whereConditions.push(
          inArray(
            field,
            values.map((v: string) => parseInt(v, 10)),
          ),
        );
      }
    }
  });

  return whereConditions.length > 0 ? and(...whereConditions) : undefined;
}
