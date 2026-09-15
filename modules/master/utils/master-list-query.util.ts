import { buildPaginationOptions, PaginationOptions } from '@packages/common';
import { MasterListQueryDto } from '../dto/master-list-query.dto';
import { MasterListStatusFilter } from '../enums/master-list-status-filter.enum';
import { MasterStatus } from '../enums/master-status.enum';

export {
  applyMasterListOrdering,
  masterStatusPriorityOrderExpr,
} from './master-list-ordering.util';

export interface MasterListOptions extends PaginationOptions {
  status?: MasterStatus;
}

export const resolveMasterListStatus = (
  status?: MasterListStatusFilter,
): MasterStatus | undefined => {
  if (!status || status === MasterListStatusFilter.ALL) {
    return undefined;
  }
  return status === MasterListStatusFilter.ACTIVE
    ? MasterStatus.ACTIVE
    : MasterStatus.INACTIVE;
};

export const buildMasterListOptions = (query: MasterListQueryDto): MasterListOptions => ({
  ...buildPaginationOptions(query),
  status: resolveMasterListStatus(query.status),
});
