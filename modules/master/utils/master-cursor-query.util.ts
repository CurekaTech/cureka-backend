import { BadRequestException } from '@nestjs/common';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import {
  buildCursorPaginatedResult,
  CursorPaginatedResult,
  CursorPaginationOptions,
  decodeCursor,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

export interface MasterCursorQueryConfig {
  alias: string;
  sortableColumns: Record<string, string>;
  defaultSortBy: string;
  defaultSortOrder?: 'ASC' | 'DESC';
  searchExpression?: string;
}

export interface MasterCursorStatusOptions extends CursorPaginationOptions {
  status?: MasterStatus;
}

const resolveSort = (
  options: CursorPaginationOptions,
  config: MasterCursorQueryConfig,
): { sortColumn: string; sortOrder: 'ASC' | 'DESC' } => {
  const sortOrder = options.sortOrder ?? config.defaultSortOrder ?? 'ASC';
  const sortColumn =
    (options.sortBy && config.sortableColumns[options.sortBy]) ??
    config.sortableColumns[config.defaultSortBy];

  if (!sortColumn) {
    throw new BadRequestException(`Unsupported sortBy value "${options.sortBy}"`);
  }

  return { sortColumn, sortOrder };
};

const buildSearchWhere = (alias: string, searchExpression?: string): string => {
  const refIdClause = `${alias}.refId ILIKE :search`;
  if (!searchExpression) {
    return refIdClause;
  }
  if (searchExpression.includes(`${alias}.refId`)) {
    return searchExpression;
  }
  return `(${searchExpression} OR ${refIdClause})`;
};

export const applyMasterCursorPagination = <T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: CursorPaginationOptions,
  config: MasterCursorQueryConfig,
): { sortColumn: string; sortOrder: 'ASC' | 'DESC' } => {
  const { sortColumn, sortOrder } = resolveSort(options, config);
  const idColumn = `${config.alias}.id`;

  qb.orderBy(sortColumn, sortOrder).addOrderBy(idColumn, sortOrder);

  if (options.search) {
    qb.andWhere(buildSearchWhere(config.alias, config.searchExpression), {
      search: `%${options.search}%`,
    });
  }

  if (options.cursor) {
    let decoded;
    try {
      decoded = decodeCursor(options.cursor);
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    const comparator = sortOrder === 'ASC' ? '>' : '<';
    qb.andWhere(
      `(${sortColumn} ${comparator} :cursorSortValue OR (${sortColumn} = :cursorSortValue AND ${idColumn} ${comparator} :cursorId))`,
      {
        cursorSortValue: decoded.sortValue,
        cursorId: decoded.id,
      },
    );
  }

  qb.take(options.limit + 1);
  return { sortColumn, sortOrder };
};

export const executeMasterCursorQuery = async <T extends ObjectLiteral & { id: string }>(
  repo: Repository<T>,
  options: MasterCursorStatusOptions,
  config: MasterCursorQueryConfig,
  applyExtraFilters?: (qb: SelectQueryBuilder<T>) => void,
): Promise<CursorPaginatedResult<T>> => {
  const qb = repo.createQueryBuilder(config.alias);
  applyExtraFilters?.(qb);

  if (options.status) {
    qb.andWhere(`${config.alias}.status = :status`, { status: options.status });
  }

  const { sortColumn } = applyMasterCursorPagination(qb, options, config);
  const rows = await qb.getMany();

  return buildCursorPaginatedResult(rows, options.limit, (row) => {
    const sortKey = Object.entries(config.sortableColumns).find(([, column]) => column === sortColumn)?.[0];
    if (!sortKey) return '';
    const value = (row as Record<string, unknown>)[sortKey];
    if (value instanceof Date) return value.toISOString();
    return value as string | number | null | undefined;
  });
};
