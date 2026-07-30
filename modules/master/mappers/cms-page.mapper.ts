import { CmsPageEntity } from '../entities/cms-page.entity';
import { ICmsPage, IPublicCmsPage } from '../interfaces/cms-page.interface';

export const mapCmsPageEntityToResponse = (entity: CmsPageEntity): ICmsPage => ({
  id: entity.id,
  refId: entity.refId,
  title: entity.title,
  slug: entity.slug,
  content: entity.content,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  status: entity.status,
  isPredefined: entity.isPredefined,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  createdBy: entity.createdBy ?? null,
  updatedBy: entity.updatedBy ?? null,
});

export const mapCmsPageEntitiesToResponse = (entities: CmsPageEntity[]): ICmsPage[] =>
  entities.map(mapCmsPageEntityToResponse);

export const mapCmsPageToPublicResponse = (entity: CmsPageEntity): IPublicCmsPage => ({
  title: entity.title,
  slug: entity.slug,
  content: entity.content,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  status: entity.status,
});
