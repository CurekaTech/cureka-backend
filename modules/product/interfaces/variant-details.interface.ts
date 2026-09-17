import { IProductInformationItem, IProductInformationItemInput } from './product-information.interface';
import { IProductPackMetadataItem } from './product-pack-metadata.interface';
import { IStorageFileReference } from '@packages/storage';

export interface IVariantInlineFaq {
  question: string;
  answer: string;
  sequence: number;
}

export interface IVariantCategoryFilterBinding {
  categoryFilterRefId: string;
  categoryFilterName?: string;
  values: string[];
}

export interface IVariantDetailFields {
  displayName?: string | null;
  description?: string | null;
  productInformation?: IProductInformationItem[];
  faqs?: IVariantInlineFaq[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string[] | null;
  components?: string | null;
  subscriptionEnabled?: boolean;
  codAvailable?: boolean;
  emiAvailable?: boolean;
  returnAllowed?: boolean;
  returnPolicy?: string | null;
  returnWindowDays?: number | null;
  replaceAllowed?: boolean;
  replaceWindowDays?: number | null;
  manufacturerRefId?: string | null;
  manufacturerName?: string | null;
  manufacturerAddress?: string | null;
  packerRefId?: string | null;
  packerName?: string | null;
  packerAddress?: string | null;
  importerRefId?: string | null;
  importerName?: string | null;
  importerAddress?: string | null;
  countryOfOriginRefId?: string | null;
  countryOfOriginName?: string | null;
  expiresInMonths?: number | null;
  sizeChart?: IStorageFileReference | null;
  singleProductUrl?: string | null;
  productPageUrl?: string | null;
  healthConcernRefIds?: string[];
  wellnessGoalRefIds?: string[];
  tagNames?: string[];
  categoryFilters?: IVariantCategoryFilterBinding[];
  packMetadata?: IProductPackMetadataItem[];
}
