import { ProductFaqMappingEntity } from '../entities/product-faq-mapping.entity';

export const sortProductFaqMappings = (
  mappings: ProductFaqMappingEntity[],
): ProductFaqMappingEntity[] =>
  mappings
    .map((mapping, index) => ({ mapping, index }))
    .sort((left, right) => {
      const leftOrder = left.mapping.sortOrder ?? 0;
      const rightOrder = right.mapping.sortOrder ?? 0;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.index - right.index;
    })
    .map(({ mapping }) => mapping);
