import { MasterStatus } from '../enums/master-status.enum';

export interface ICmsPage {
  id: string;
  refId: string;
  title: string;
  slug: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: MasterStatus;
  isPredefined: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Storefront / mobile response for GET /cms/:slug */
export interface IPublicCmsPage {
  title: string;
  slug: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: MasterStatus;
}

/** Stable public keys for predefined CMS pages (homepage / footer). */
export type PublicCmsPageKey =
  | 'aboutCureka'
  | 'privacyPolicy'
  | 'termsAndConditions'
  | 'returnsRefunds'
  | 'shippingPolicy';

/** One payload with every policy page keyed for storefront footer / links. */
export type IPublicCmsPagesByKey = Record<PublicCmsPageKey, IPublicCmsPage | null>;

export const PUBLIC_CMS_PAGE_KEY_BY_SLUG: Record<string, PublicCmsPageKey> = {
  'about-cureka': 'aboutCureka',
  'privacy-policy': 'privacyPolicy',
  'terms-and-conditions': 'termsAndConditions',
  'returns-refunds': 'returnsRefunds',
  'shipping-policy': 'shippingPolicy',
};
