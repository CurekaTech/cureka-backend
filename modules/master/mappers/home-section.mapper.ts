import { HomeSectionEntity } from '../entities/home-section.entity';
import { IHomeSection } from '../interfaces/home-section.interface';

export const mapHomeSectionEntityToResponse = (entity: HomeSectionEntity): IHomeSection => ({
  id: entity.id,
  refId: entity.refId,
  title: entity.title,
  slug: entity.slug,
  type: entity.type,
  index: entity.sectionIndex,
  status: entity.status,
  banners: entity.banners ?? null,
  productRefIds: entity.productRefIds ?? null,
  categoryRefIds: entity.categoryRefIds ?? null,
  pageTitle: entity.pageTitle ?? null,
  pageDescription: entity.pageDescription ?? null,
  pageCanonicalUrl: entity.pageCanonicalUrl ?? null,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const mapHomeSectionEntitiesToResponse = (
  entities: HomeSectionEntity[],
): IHomeSection[] => entities.map(mapHomeSectionEntityToResponse);
