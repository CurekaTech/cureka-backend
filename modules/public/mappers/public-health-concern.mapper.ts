import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
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
  faqs: entity.faqs ?? [],
});
