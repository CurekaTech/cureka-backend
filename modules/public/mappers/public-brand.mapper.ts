import { BrandEntity } from '@modules/master/entities/brand.entity';
import { IPublicBrandListItem } from '../interfaces/public-master.interface';

export const mapBrandEntityToPublicListItem = (entity: BrandEntity): IPublicBrandListItem => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  logo: entity.logo,
});

export const mapBrandEntitiesToPublicListItems = (
  entities: BrandEntity[],
): IPublicBrandListItem[] => entities.map(mapBrandEntityToPublicListItem);
