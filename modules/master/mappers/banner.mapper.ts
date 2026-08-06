import { BannerEntity } from '../entities/banner.entity';
import { IBanner, IStorefrontBannerItem } from '../interfaces/banner.interface';

export const mapBannerEntityToResponse = (entity: BannerEntity): IBanner =>
  ({
  id: entity.id,
  refId: entity.refId,
  placement: entity.placement,
  slot: entity.slot,
  resourceType: entity.resourceType,
  resourceRefId: entity.resourceRefId,
  externalUrl: entity.externalUrl,
  title: entity.title,
  imageUrl: entity.imageUrl,
  sortOrder: entity.sortOrder,
  status: entity.status,
  startsAt: entity.startsAt,
  endsAt: entity.endsAt,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as unknown as IBanner;

export const mapBannerEntitiesToResponse = (entities: BannerEntity[]): IBanner[] =>
  entities.map(mapBannerEntityToResponse);

export const mapBannerToStorefrontItem = (
  entity: BannerEntity,
  ctaHref: string | null,
): IStorefrontBannerItem =>
  ({
  refId: entity.refId,
  title: entity.title,
  placement: entity.placement,
  slot: entity.slot,
  imageUrl: entity.imageUrl,
  ctaHref,
  }) as unknown as IStorefrontBannerItem;
