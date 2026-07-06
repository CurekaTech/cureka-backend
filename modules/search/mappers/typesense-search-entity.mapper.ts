import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  buildBrandDocumentId,
  buildCategoryDocumentId,
  buildHealthConcernDocumentId,
} from '../constants/typesense-document-id.constant';
import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import { ITypesenseSearchDocument } from '../interfaces/typesense-search-document.interface';

export function mapCategoryToTypesenseDocument(
  category: CategoryEntity,
): ITypesenseSearchDocument | null {
  if (category.status !== MasterStatus.ACTIVE) {
    return null;
  }

  return {
    id: buildCategoryDocumentId(category.refId),
    refId: category.refId,
    entityType: SEARCH_ENTITY_TYPES.CATEGORY,
    name: category.name,
    slug: category.slug,
  };
}

export function mapBrandToTypesenseDocument(brand: BrandEntity): ITypesenseSearchDocument | null {
  if (brand.status !== MasterStatus.ACTIVE) {
    return null;
  }

  return {
    id: buildBrandDocumentId(brand.refId),
    refId: brand.refId,
    entityType: SEARCH_ENTITY_TYPES.BRAND,
    name: brand.name,
    slug: brand.slug,
  };
}

export function mapHealthConcernToTypesenseDocument(
  healthConcern: HealthConcernEntity,
): ITypesenseSearchDocument | null {
  if (healthConcern.status !== MasterStatus.ACTIVE) {
    return null;
  }

  return {
    id: buildHealthConcernDocumentId(healthConcern.refId),
    refId: healthConcern.refId,
    entityType: SEARCH_ENTITY_TYPES.HEALTH_CONCERN,
    name: healthConcern.name,
    slug: healthConcern.slug,
  };
}
