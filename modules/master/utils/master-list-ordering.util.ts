import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { MasterStatus } from '../enums/master-status.enum';

/**
 * Admin master lists: when status filter is omitted/`all`, active rows come first,
 * then inactive, then the caller's secondary sort (createdAt, name, …).
 * When a status filter is applied, only the secondary sort is used.
 *
 * Uses `${alias}.status ASC` (not a CASE expression): TypeORM mis-parses CASE
 * `orderBy` keys that contain `.`, and `addSelect` + skip/take breaks on joins.
 * With only `active` / `inactive`, alphabetical ASC already yields active-first.
 */
export const applyMasterListOrdering = <T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  statusFilter: string | undefined | null,
  sortColumn: string,
  sortOrder: 'ASC' | 'DESC',
): SelectQueryBuilder<T> => {
  if (statusFilter == null || statusFilter === '' || statusFilter === 'all') {
    // Guard: if caller already sorts by status, don't duplicate the column.
    if (sortColumn === `${alias}.status`) {
      return qb.orderBy(sortColumn, sortOrder);
    }
    return qb.orderBy(`${alias}.status`, 'ASC').addOrderBy(sortColumn, sortOrder);
  }
  return qb.orderBy(sortColumn, sortOrder);
};

/** @deprecated Kept for specs / docs; prefer applyMasterListOrdering. */
export const masterStatusPriorityOrderExpr = (alias: string): string =>
  `CASE WHEN ${alias}.status = '${MasterStatus.ACTIVE}' THEN 0 ELSE 1 END`;
