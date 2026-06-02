import { HealthConcernEntity } from '../entities/health-concern.entity';
import { IHealthConcern } from '../interfaces/health-concern.interface';

export const mapHealthConcernEntityToResponse = (entity: HealthConcernEntity): IHealthConcern => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  icon: entity.icon,
  slug: entity.slug,
  description: entity.description,
  banner: entity.banner,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapHealthConcernEntitiesToResponse = (
  entities: HealthConcernEntity[],
): IHealthConcern[] => entities.map(mapHealthConcernEntityToResponse);
