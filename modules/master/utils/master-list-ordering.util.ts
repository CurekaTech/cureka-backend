import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { MasterStatus } from '../enums/master-status.enum';

/** Trusted enum literal for ORDER BY — not user input. */
export const masterStatusPriorityOrderExpr = (alias: string): string =>
  `CASE WHEN ${alias}.status = '${MasterStatus.ACTIVE}' THEN 0 ELSE 1 END`;

/**
 * Admin master lists: when status filter is omitted/`all`, active rows come first,
 * then inactive, then the caller's secondary sort (createdAt, name, …).
 * When a status filter is applied, only the secondary sort is used.
 */
export const applyMasterListOrdering = <T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  statusFilter: string | undefined | null,
  sortColumn: string,
  sortOrder: 'ASC' | 'DESC',
): SelectQueryBuilder<T> => {
  if (statusFilter == null || statusFilter === '' || statusFilter === 'all') {
    return qb
      .orderBy(masterStatusPriorityOrderExpr(alias), 'ASC')
      .addOrderBy(sortColumn, sortOrder);
  }
  return qb.orderBy(sortColumn, sortOrder);
};
