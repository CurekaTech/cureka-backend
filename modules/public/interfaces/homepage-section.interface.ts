import { HomepageSectionKey } from '../enums/homepage-section.enum';
import { IPublicCategoryTree } from './public-category.interface';
import { IPublicProductCard } from './public-product.interface';

export type HomepageSectionDataMap = {
  [HomepageSectionKey.SHOP_BY_CATEGORY]: IPublicCategoryTree[];
  [HomepageSectionKey.FEATURED_PRODUCTS]: IPublicProductCard[];
};

export type HomepageSectionsResponse = Partial<HomepageSectionDataMap>;
