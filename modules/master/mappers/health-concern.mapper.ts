import { HealthConcernEntity } from '../entities/health-concern.entity';
import { IHealthConcern } from '../interfaces/health-concern.interface';
import { formatDateOnly } from '../utils/date-only.util';
import { mapMasterFaqs } from '../utils/master-faq.util';

export const mapHealthConcernEntityToResponse = (entity: HealthConcernEntity): IHealthConcern =>
  ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  icon: entity.icon,
  slug: entity.slug,
  description: entity.description,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  medicalConditionName: entity.medicalConditionName,
  alternateName: entity.alternateName,
  medicalConditionDescription: entity.medicalConditionDescription,
  reviewedByName: entity.reviewedByName,
  reviewedByJobTitle: entity.reviewedByJobTitle,
  lastReviewed: formatDateOnly(entity.lastReviewed),
  patientAudience: entity.patientAudience,
  banner: entity.banner,
  faqBanner: entity.faqBanner,
  status: entity.status,
  inHomePage: entity.inHomePage,
  sortIndex: entity.sortIndex,
  faqs: mapMasterFaqs(entity.faqs),
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as IHealthConcern;

export const mapHealthConcernEntitiesToResponse = (
  entities: HealthConcernEntity[],
): IHealthConcern[] => entities.map(mapHealthConcernEntityToResponse);
