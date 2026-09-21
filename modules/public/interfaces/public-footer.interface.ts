import { PublicCmsPageKey } from '@modules/master/interfaces/cms-page.interface';

/** Slim footer chrome — no images, no CMS HTML body. */
export interface IPublicFooterCategoryLink {
  refId: string;
  name: string;
  slug: string;
  permalink: string;
}

export interface IPublicFooterBrandLink {
  refId: string;
  name: string;
  slug: string;
}

export interface IPublicFooterPolicyLink {
  key: PublicCmsPageKey;
  title: string;
  slug: string;
}

export interface IPublicFooterNav {
  categories: IPublicFooterCategoryLink[];
  brands: IPublicFooterBrandLink[];
  policies: IPublicFooterPolicyLink[];
}
