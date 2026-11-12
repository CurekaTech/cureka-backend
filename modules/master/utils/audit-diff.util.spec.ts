import { diffAuditFields, mergeAuditChanges } from './audit-diff.util';

describe('diffAuditFields', () => {
  it('records only fields whose values actually changed', () => {
    expect(
      diffAuditFields({
        table: 'products',
        recordId: 'p1',
        before: { name: 'Old', slug: 'old', description: 'same' },
        after: { name: 'New', slug: 'new', description: 'same' },
      }),
    ).toEqual([
      {
        table: 'products',
        recordId: 'p1',
        column: 'name',
        field: 'name',
        changeType: 'updated',
        oldValue: 'Old',
        newValue: 'New',
      },
      {
        table: 'products',
        recordId: 'p1',
        column: 'slug',
        field: 'slug',
        changeType: 'updated',
        oldValue: 'old',
        newValue: 'new',
      },
    ]);
  });

  it('maps camelCase fields to snake_case columns', () => {
    const [change] = diffAuditFields({
      table: 'products',
      recordId: 'p1',
      before: { singleProductUrl: '/a' },
      after: { singleProductUrl: '/b' },
    });
    expect(change).toMatchObject({ column: 'single_product_url', field: 'singleProductUrl' });
  });
});

describe('mergeAuditChanges', () => {
  it('keeps the first change for a table+field pair', () => {
    const first = diffAuditFields({
      table: 'products',
      recordId: 'p1',
      before: { name: 'A' },
      after: { name: 'B' },
    });
    const second = diffAuditFields({
      table: 'products',
      recordId: 'p1',
      before: { name: 'B' },
      after: { name: 'C' },
    });
    expect(mergeAuditChanges(first, second)).toEqual(first);
  });
});
