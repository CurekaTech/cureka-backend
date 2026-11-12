import { AuditFieldChange } from '@modules/master/types/audit-capture.types';
import { diffAuditFields, mergeAuditChanges } from '@modules/master/utils/audit-diff.util';
import { ProductEntity } from '../entities/product.entity';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';

const DTO_REF_FIELDS: Array<{
  field: string;
  column: string;
  fromExisting: (product: ProductEntity) => unknown;
}> = [
  { field: 'productNatureRefId', column: 'product_nature_id', fromExisting: (p) => p.productNature?.refId ?? null },
  { field: 'categoryRefId', column: 'category_id', fromExisting: (p) => p.category?.refId ?? null },
  { field: 'subCategoryRefId', column: 'sub_category_id', fromExisting: (p) => p.subCategory?.refId ?? null },
  { field: 'subSubCategoryRefId', column: 'sub_sub_category_id', fromExisting: (p) => p.subSubCategory?.refId ?? null },
  {
    field: 'subSubSubCategoryRefId',
    column: 'sub_sub_sub_category_id',
    fromExisting: (p) => p.subSubSubCategory?.refId ?? null,
  },
  { field: 'brandRefId', column: 'brand_id', fromExisting: (p) => p.brand?.refId ?? null },
  { field: 'manufacturerRefId', column: 'manufacturer_id', fromExisting: (p) => p.manufacturer?.refId ?? null },
  { field: 'packerRefId', column: 'packer_id', fromExisting: (p) => p.packer?.refId ?? null },
  { field: 'importerRefId', column: 'importer_id', fromExisting: (p) => p.importer?.refId ?? null },
  {
    field: 'countryOfOriginRefId',
    column: 'country_of_origin_id',
    fromExisting: (p) => p.countryOfOrigin?.refId ?? null,
  },
  {
    field: 'tagNames',
    column: 'product_tag_mappings',
    fromExisting: (p) => p.tagMappings?.map((item) => item.tag?.name).filter(Boolean) ?? null,
  },
  {
    field: 'healthConcernRefIds',
    column: 'product_health_concerns',
    fromExisting: (p) => p.healthConcernMappings?.map((item) => item.healthConcern?.refId).filter(Boolean) ?? null,
  },
  {
    field: 'wellnessGoalRefIds',
    column: 'product_wellness_goals',
    fromExisting: (p) => p.wellnessGoalMappings?.map((item) => item.wellnessGoal?.refId).filter(Boolean) ?? null,
  },
  {
    field: 'attributeRefIds',
    column: 'product_attribute_mappings',
    fromExisting: (p) => p.attributeMappings?.map((item) => item.attribute?.refId).filter(Boolean) ?? null,
  },
];

const RELATION_KEYS = new Set([
  'variants',
  'media',
  'tagMappings',
  'healthConcernMappings',
  'wellnessGoalMappings',
  'attributeMappings',
  'faqMappings',
  'bundleItems',
  'categoryHierarchies',
  'categoryFilterMappings',
  'pincodeMappings',
  'productNature',
  'category',
  'subCategory',
  'subSubCategory',
  'subSubSubCategory',
  'brand',
  'manufacturer',
  'packer',
  'importer',
  'countryOfOrigin',
]);

function asRecord(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

export function captureProductAuditChanges(input: {
  product: ProductEntity;
  dto: CreateProductDto | UpdateProductDto;
  payload: Partial<ProductEntity>;
  action: 'created' | 'updated';
}): AuditFieldChange[] {
  const { product, dto, payload, action } = input;
  const scalarAfter: Record<string, unknown> = {};
  const scalarBefore: Record<string, unknown> = {};
  const existing = asRecord(product);
  const source = action === 'updated' ? asRecord(payload) : asRecord(dto);

  for (const [field, value] of Object.entries(source)) {
    if (!(field in existing) || RELATION_KEYS.has(field)) continue;
    scalarAfter[field] = value;
    scalarBefore[field] = existing[field];
  }

  const scalarChanges = diffAuditFields({
    table: 'products',
    recordId: product.id,
    before: action === 'created' ? {} : scalarBefore,
    after: scalarAfter,
    changeType: action,
  });

  const dtoRecord = asRecord(dto);
  const relationAfter: Record<string, unknown> = {};
  const relationBefore: Record<string, unknown> = {};
  const columnByField: Record<string, string> = {};
  for (const spec of DTO_REF_FIELDS) {
    if (dtoRecord[spec.field] === undefined) continue;
    relationAfter[spec.field] = dtoRecord[spec.field];
    relationBefore[spec.field] = spec.fromExisting(product);
    columnByField[spec.field] = spec.column;
  }

  const relationChanges = diffAuditFields({
    table: 'products',
    recordId: product.id,
    before: action === 'created' ? {} : relationBefore,
    after: relationAfter,
    changeType: action,
    columnByField,
  });

  return mergeAuditChanges(scalarChanges, relationChanges);
}
