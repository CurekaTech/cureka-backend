export interface PaginationOptions {
  page?: number;
  limit?: number;
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

export const buildPaginationOptions = (options: PaginationOptions): Required<PaginationOptions> => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  return { page, limit };
};

export const buildPaginatedResult = <T>(
  data: T[],
  total: number,
  options: Required<PaginationOptions>,
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

export const buildSkipTake = (
  options: Required<PaginationOptions>,
): { skip: number; take: number } => ({
  skip: (options.page - 1) * options.limit,
  take: options.limit,
});
