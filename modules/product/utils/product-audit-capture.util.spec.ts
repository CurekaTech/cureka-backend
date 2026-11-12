import { captureProductAuditChanges } from './product-audit-capture.util';
import { ProductEntity } from '../entities/product.entity';

describe('captureProductAuditChanges', () => {
  it('emits old/new values for product columns that actually changed', () => {
    const product = {
      id: 'p1',
      name: 'Old name',
      slug: 'old-slug',
      singleProductUrl: '/old',
      description: 'same',
    } as ProductEntity;

    const changes = captureProductAuditChanges({
      product,
      dto: { name: 'New name', slug: 'new-slug', categoryRefId: 'CAT1' } as never,
      payload: { name: 'New name', slug: 'new-slug', singleProductUrl: '/new' },
      action: 'updated',
    });

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', oldValue: 'Old name', newValue: 'New name', column: 'name' }),
        expect.objectContaining({ field: 'slug', oldValue: 'old-slug', newValue: 'new-slug' }),
        expect.objectContaining({
          field: 'singleProductUrl',
          column: 'single_product_url',
          oldValue: '/old',
          newValue: '/new',
        }),
      ]),
    );
    expect(changes.find((change) => change.field === 'description')).toBeUndefined();
  });
});
