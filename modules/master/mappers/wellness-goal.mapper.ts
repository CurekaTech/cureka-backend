import { WellnessGoalEntity } from '../entities/wellness-goal.entity';
import { IWellnessGoal } from '../interfaces/wellness-goal.interface';

export const mapWellnessGoalEntityToResponse = (entity: WellnessGoalEntity): IWellnessGoal =>
  ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  description: entity.description,
  image: entity.image,
  faqBanner: entity.faqBanner,
  status: entity.status,
  inHomePage: entity.inHomePage,
  faqs: entity.faqs ?? [],
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as IWellnessGoal;

export const mapWellnessGoalEntitiesToResponse = (
  entities: WellnessGoalEntity[],
): IWellnessGoal[] => entities.map(mapWellnessGoalEntityToResponse);
