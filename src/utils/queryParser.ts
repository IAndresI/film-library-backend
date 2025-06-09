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
  const queryKeys = Object.keys(req.query);

  // Ищем первую сортировку в формате sort[0][id] и sort[0][desc]
  let sortId: string | undefined;
  let sortDesc: string | undefined;

  for (const key of queryKeys) {
    const sortMatch = key.match(/^sort\[(\d+)\]\[(.+)\]$/);
    if (sortMatch) {
      const field = sortMatch[2];
      if (field === 'id') {
        sortId = req.query[key] as string;
      } else if (field === 'desc') {
        sortDesc = req.query[key] as string;
      }
    }
  }

  if (sortDesc && sortId) {
    const field = selectFields[sortId];
    if (field) {
      return sortDesc === 'true' ? desc(field) : asc(field);
    }
  }

  // По умолчанию сортировка по createdAt desc
  return desc(selectFields.createdAt);
}

export function parseFilterParams(
  req: Request,
  selectFields: Record<string, any>,
) {
  const queryKeys = Object.keys(req.query);

  // Группируем фильтры по индексу
  const filtersMap = new Map<
    number,
    { id?: string; value: string[]; isStringFilter?: boolean }
  >();

  queryKeys.forEach((key) => {
    const filterMatch = key.match(/^filters\[(\d+)\]\[(.+)\]$/);
    if (filterMatch) {
      const index = parseInt(filterMatch[1]);
      const field = filterMatch[2];

      if (!filtersMap.has(index)) {
        filtersMap.set(index, { value: [] });
      }

      const filter = filtersMap.get(index)!;

      if (field === 'id') {
        filter.id = req.query[key] as string;
      } else if (field === 'value' && typeof req.query[key] === 'string') {
        // Если value передано как строка (не массив) - это строковый фильтр
        filter.value = [req.query[key] as string];
        filter.isStringFilter = true;
      } else if (field.startsWith('value][')) {
        // Если value передано как массив
        filter.value.push(req.query[key] as string);
        filter.isStringFilter = false;
      }
    }
  });

  // Преобразуем в whereConditions
  const whereConditions: any[] = [];

  Array.from(filtersMap.values())
    .filter((filter) => filter.id && filter.value.length > 0)
    .forEach((filter) => {
      const field = selectFields[filter.id!];
      if (field && filter.value && Array.isArray(filter.value)) {
        if (filter.isStringFilter) {
          // Для строковых фильтров - поиск по подстроке (независимо от регистра)
          whereConditions.push(ilike(field, `%${filter.value[0]}%`));
        } else {
          // Для массивов - точное совпадение
          if (
            filter.id === 'isApproved' ||
            filter.id === 'isAdmin' ||
            filter.id === 'isVisible'
          ) {
            // Для boolean полей
            whereConditions.push(
              inArray(
                field,
                filter.value.map((v: string) => v === 'true'),
              ),
            );
          } else if (
            filter.id === 'orderStatus' ||
            filter.id === 'subscriptionStatus'
          ) {
            // Для строковых enum полей (status, orderId)
            whereConditions.push(inArray(field, filter.value));
          } else {
            // Для числовых полей
            whereConditions.push(
              inArray(
                field,
                filter.value.map((v: string) => parseInt(v, 10)),
              ),
            );
          }
        }
      }
    });

  return whereConditions.length > 0 ? and(...whereConditions) : undefined;
}
