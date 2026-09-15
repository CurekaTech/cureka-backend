import { MasterStatus } from '../enums/master-status.enum';
import { masterStatusPriorityOrderExpr } from './master-list-ordering.util';

describe('master list status ordering', () => {
  it('documents active-before-inactive via enum string order', () => {
    expect(MasterStatus.ACTIVE < MasterStatus.INACTIVE).toBe(true);
  });

  it('keeps CASE helper for reference (not used in QueryBuilder orderBy)', () => {
    expect(masterStatusPriorityOrderExpr('brand')).toContain(`brand.status = '${MasterStatus.ACTIVE}'`);
  });
});
