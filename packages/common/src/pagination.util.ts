export interface PaginationOptions {
  page: number;
  limit: number;
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

export const buildPaginationOptions = (raw: { page?: number; limit?: number }): PaginationOptions => ({
  page: Math.max(1, raw.page ?? 1),
  limit: Math.min(100, Math.max(1, raw.limit ?? 20)),
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
