import { BrandEntity } from '@modules/master/entities/brand.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';
import { mapBrandEntityToListingContext } from './public-brand.mapper';
import { mapHealthConcernEntityToListingContext } from './public-health-concern.mapper';
import { mapWellnessGoalEntityToListingContext } from './public-wellness-goal.mapper';

describe('product list listing heading', () => {
  it('returns the saved HTML heading on a filtered brand', () => {
    const mapped = mapBrandEntityToListingContext({
      refId: 'BRA1',
      name: 'Himalaya',
      listingHeading: '<u>Himalaya</u>',
      slug: 'himalaya',
      showBanner: true,
      showVideo: true,
      showFeaturedBanner: true,
      showPromotionalBanner: true,
      showSecondaryBanner: true,
      showSecondaryVideo: true,
      showOfferBanner: true,
      showBrandHighlights: true,
      showDescription: true,
      faqs: [],
    } as unknown as BrandEntity);

    expect(mapped.listingHeading).toBe('<u>Himalaya</u>');
    expect(mapped.name).toBe('Himalaya');
  });

  it('returns null when the health concern and wellness goal have no heading', () => {
    const concern = mapHealthConcernEntityToListingContext({
      refId: 'HEA1',
      name: 'Hair Fall',
      slug: 'hair-fall',
      description: null,
      icon: null,
      banner: null,
      metaTitle: null,
      metaDescription: null,
      medicalConditionName: null,
      patientAudience: null,
      alternateName: null,
      medicalConditionDescription: null,
      reviewedByName: null,
      reviewedByJobTitle: null,
      lastReviewed: null,
      faqs: [],
      faqBanner: null,
    } as unknown as HealthConcernEntity);
    const goal = mapWellnessGoalEntityToListingContext({
      refId: 'WEL1',
      name: 'Immunity',
      description: null,
      image: null,
      faqs: [],
      faqBanner: null,
    } as unknown as WellnessGoalEntity);

    expect(concern.listingHeading).toBeNull();
    expect(goal.listingHeading).toBeNull();
  });
});
