import { WellnessGoalEntity } from '../entities/wellness-goal.entity';
import { IWellnessGoal } from '../interfaces/wellness-goal.interface';

export const mapWellnessGoalEntityToResponse = (entity: WellnessGoalEntity): IWellnessGoal => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  image: entity.image,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapWellnessGoalEntitiesToResponse = (
  entities: WellnessGoalEntity[],
): IWellnessGoal[] => entities.map(mapWellnessGoalEntityToResponse);
