import { BadRequestException } from '@nestjs/common';
import { ProductCategoryFilterBindingDto } from '../dto/product-category-filter.dto';

export interface IResolvedCategoryFilterCriterion {
  categoryFilterId: string;
  values: string[];
}

export const parseCategoryFilterQueryBindings = (input: {
  categoryFilters?: string;
  categoryFilterRefId?: string;
  categoryFilterValues?: string[];
}): ProductCategoryFilterBindingDto[] | undefined => {
  if (input.categoryFilters) {
    try {
      const parsed: unknown = JSON.parse(input.categoryFilters);
      if (!Array.isArray(parsed)) {
        throw new BadRequestException('categoryFilters must be a JSON array');
      }

      return parsed.map((item, index) => {
        if (!item || typeof item !== 'object') {
          throw new BadRequestException(`categoryFilters[${index}] must be an object`);
        }
        const binding = item as Record<string, unknown>;
        const categoryFilterRefId = binding.categoryFilterRefId;
        const values = binding.values;

        if (typeof categoryFilterRefId !== 'string' || !categoryFilterRefId.trim()) {
          throw new BadRequestException(
            `categoryFilters[${index}].categoryFilterRefId is required`,
          );
        }
        if (!Array.isArray(values) || !values.length) {
          throw new BadRequestException(`categoryFilters[${index}].values must be a non-empty array`);
        }

        return {
          categoryFilterRefId: categoryFilterRefId.trim(),
          values: values.map((value) => String(value).trim()).filter(Boolean),
        };
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid categoryFilters JSON');
    }
  }

  if (input.categoryFilterRefId) {
    if (!input.categoryFilterValues?.length) {
      throw new BadRequestException(
        'categoryFilterValues is required when categoryFilterRefId is provided',
      );
    }
    return [
      {
        categoryFilterRefId: input.categoryFilterRefId,
        values: input.categoryFilterValues,
      },
    ];
  }

  return undefined;
};
