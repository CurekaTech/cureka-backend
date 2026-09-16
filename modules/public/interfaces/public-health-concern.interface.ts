import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { PatientAudience } from '@modules/master/enums/patient-audience.enum';

/**
 * One "Expert-Curated Wellness Bundles" card shown on the homepage, sourced from a
 * health concern flagged for the homepage. The health concern banner is intentionally
 * excluded here; only the icon image is exposed.
 */
export interface IPublicHealthConcernCard {
  refId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: IStorageFileReference | IStorageFileReferenceResponse | null;
}

/**
 * Active health concerns flagged for the homepage (`inHomePage`), ordered by `sortIndex`.
 * Used by GET /public/homepage/health-concerns (web + mobile homepage strip).
 */
export interface IPublicHomePageHealthConcern {
  refId: string;
  name: string;
  slug: string;
  icon: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  description: string | null;
  /** Homepage display order. Lower = first; null = unordered (sorted after indexed items). */
  sortIndex: number | null;
  /** Included on view-all listing responses; omitted from the homepage strip endpoint. */
  metaTitle?: string | null;
  metaDescription?: string | null;
  medicalConditionName?: string | null;
  patientAudience?: PatientAudience | null;
}

/** Active health concern for public view-all listing (not limited to inHomePage). */
export type IPublicHealthConcernListItem = IPublicHomePageHealthConcern;

/** Health concern metadata when product list is scoped by healthConcernSlug/RefId. */
export interface IPublicHealthConcernProductListingContext {
  refId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  metaTitle: string | null;
  metaDescription: string | null;
  medicalConditionName: string | null;
  patientAudience: PatientAudience | null;
  alternateName: string | null;
  medicalConditionDescription: string | null;
  reviewedByName: string | null;
  reviewedByJobTitle: string | null;
  lastReviewed: string | null;
  faqs: Array<{ question: string; answer: string; sequence: number }>;
  faqBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
}
