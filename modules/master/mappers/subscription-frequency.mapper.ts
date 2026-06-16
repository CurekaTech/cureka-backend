import { SubscriptionFrequencyEntity } from '../entities/subscription-frequency.entity';
import { ISubscriptionFrequency } from '../interfaces/subscription-frequency.interface';

export const mapSubscriptionFrequencyEntityToResponse = (
  entity: SubscriptionFrequencyEntity,
): ISubscriptionFrequency => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  value: entity.value,
  unit: entity.unit,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapSubscriptionFrequencyEntitiesToResponse = (
  entities: SubscriptionFrequencyEntity[],
): ISubscriptionFrequency[] => entities.map(mapSubscriptionFrequencyEntityToResponse);
