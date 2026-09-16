import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';
import { mapMasterFaqs } from '@modules/master/utils/master-faq.util';
import { IPublicWellnessGoalProductListingContext } from '../interfaces/public-wellness-goal.interface';

export const mapWellnessGoalEntityToListingContext = (
  entity: WellnessGoalEntity,
): IPublicWellnessGoalProductListingContext => ({
  refId: entity.refId,
  name: entity.name,
  description: entity.description,
  image: entity.image,
  faqs: mapMasterFaqs(entity.faqs),
  faqBanner: entity.faqBanner,
});
