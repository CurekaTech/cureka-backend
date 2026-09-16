import { ProductFaqMappingEntity } from '../entities/product-faq-mapping.entity';
import { sortProductFaqMappings } from './product-faq-order.util';

const mapping = (sortOrder: number, productFaqId: string): ProductFaqMappingEntity =>
  ({
    productId: 'product-1',
    productFaqId,
    sortOrder,
  }) as ProductFaqMappingEntity;

describe('sortProductFaqMappings', () => {
  it('orders by sortOrder ascending', () => {
    const sorted = sortProductFaqMappings([
      mapping(2, 'faq-c'),
      mapping(0, 'faq-a'),
      mapping(1, 'faq-b'),
    ]);
    expect(sorted.map((item) => item.productFaqId)).toEqual(['faq-a', 'faq-b', 'faq-c']);
  });
});
