export interface PaginationOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export const buildPaginationOptions = (raw: {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}): PaginationOptions => ({
  page: Math.max(1, raw.page ?? 1),
  limit: Math.min(100, Math.max(1, raw.limit ?? 20)),
  search: raw.search?.trim() || undefined,
  sortBy: raw.sortBy?.trim() || undefined,
  sortOrder: raw.sortOrder ?? 'DESC',
});

export const buildPaginatedResult = <T>(
  data: T[],
  total: number,
  options: PaginationOptions,
): PaginatedResult<T> => {
  const totalPages = Math.ceil(total / options.limit);
  return {
    data,
    total,
    page: options.page,
    limit: options.limit,
    totalPages,
    hasNextPage: options.page < totalPages,
    hasPreviousPage: options.page > 1,
  };
};

export const generateSlug = (text: string): string => {
  return text.toLowerCase().replace(/ /g, '-');
};
