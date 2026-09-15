import { MasterStatus } from '../enums/master-status.enum';
import { masterStatusPriorityOrderExpr } from './master-list-ordering.util';

describe('masterStatusPriorityOrderExpr', () => {
  it('ranks active before inactive for ORDER BY', () => {
    expect(masterStatusPriorityOrderExpr('brand')).toBe(
      `CASE WHEN brand.status = '${MasterStatus.ACTIVE}' THEN 0 ELSE 1 END`,
    );
  });
});
