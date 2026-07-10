import { ExpertTalkItemEntity } from '../entities/expert-talk-item.entity';
import {
  IExpertTalkItem,
  IStorefrontExpertTalkItem,
} from '../interfaces/expert-talk.interface';

export const mapExpertTalkEntityToResponse = (
  entity: ExpertTalkItemEntity,
): IExpertTalkItem =>
  ({
    id: entity.id,
    refId: entity.refId,
    title: entity.title,
    description: entity.description,
    videoUrl: entity.videoUrl,
    thumbnail: entity.thumbnail,
    contentType: entity.contentType,
    sortOrder: entity.sortOrder,
    status: entity.status,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  }) as unknown as IExpertTalkItem;

export const mapExpertTalkEntitiesToResponse = (
  entities: ExpertTalkItemEntity[],
): IExpertTalkItem[] => entities.map(mapExpertTalkEntityToResponse);

export const mapExpertTalkToStorefrontItem = (
  entity: ExpertTalkItemEntity,
): IStorefrontExpertTalkItem =>
  ({
    refId: entity.refId,
    title: entity.title,
    description: entity.description,
    videoUrl: entity.videoUrl,
    thumbnail: entity.thumbnail,
    contentType: entity.contentType,
    sortOrder: entity.sortOrder,
  }) as unknown as IStorefrontExpertTalkItem;
