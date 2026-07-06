export interface CursorPayload {
  id: string;
  sortValue: string;
}

export interface CursorPaginationOptions {
  limit: number;
  cursor?: string;
  search?: string;
  sortBy?: string;
  sortOrder: 'ASC' | 'DESC';
}

export interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export const buildCursorPaginationOptions = (raw: {
  limit?: number;
  cursor?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}): CursorPaginationOptions => ({
  limit: Math.min(100, Math.max(1, raw.limit ?? 20)),
  cursor: raw.cursor?.trim() || undefined,
  search: raw.search?.trim() || undefined,
  sortBy: raw.sortBy?.trim() || undefined,
  sortOrder: raw.sortOrder ?? 'ASC',
});

export const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

export const decodeCursor = (cursor: string): CursorPayload => {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as CursorPayload).id !== 'string' ||
      typeof (parsed as CursorPayload).sortValue !== 'string'
    ) {
      throw new Error('Invalid cursor shape');
    }
    return parsed as CursorPayload;
  } catch {
    throw new Error('Invalid cursor');
  }
};

export const buildCursorPaginatedResult = <T extends { id: string }>(
  rows: T[],
  limit: number,
  getSortValue: (row: T) => string | number | Date | null | undefined,
): CursorPaginatedResult<T> => {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);

  return {
    data,
    hasMore,
    limit,
    nextCursor: hasMore && last
      ? encodeCursor({
          id: last.id,
          sortValue: String(getSortValue(last) ?? ''),
        })
      : null,
  };
};
