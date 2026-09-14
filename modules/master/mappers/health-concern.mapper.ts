import { HealthConcernEntity } from '../entities/health-concern.entity';
import { IHealthConcern } from '../interfaces/health-concern.interface';

export const mapHealthConcernEntityToResponse = (entity: HealthConcernEntity): IHealthConcern =>
  ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  icon: entity.icon,
  slug: entity.slug,
  description: entity.description,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  banner: entity.banner,
  status: entity.status,
  inHomePage: entity.inHomePage,
  sortIndex: entity.sortIndex,
  faqs: entity.faqs ?? [],
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as IHealthConcern;

export const mapHealthConcernEntitiesToResponse = (
  entities: HealthConcernEntity[],
): IHealthConcern[] => entities.map(mapHealthConcernEntityToResponse);
