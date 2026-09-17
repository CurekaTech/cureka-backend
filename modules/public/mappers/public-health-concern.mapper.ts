import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { formatDateOnly } from '@modules/master/utils/date-only.util';
import { mapMasterFaqs } from '@modules/master/utils/master-faq.util';
import { IPublicHealthConcernProductListingContext } from '../interfaces/public-health-concern.interface';

export const mapHealthConcernEntityToListingContext = (
  entity: HealthConcernEntity,
): IPublicHealthConcernProductListingContext => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  description: entity.description,
  icon: entity.icon,
  banner: entity.banner,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  medicalConditionName: entity.medicalConditionName,
  patientAudience: entity.patientAudience,
  alternateName: entity.alternateName,
  medicalConditionDescription: entity.medicalConditionDescription,
  reviewedByName: entity.reviewedByName,
  reviewedByJobTitle: entity.reviewedByJobTitle,
  lastReviewed: formatDateOnly(entity.lastReviewed),
  faqs: mapMasterFaqs(entity.faqs),
  faqBanner: entity.faqBanner,
});
