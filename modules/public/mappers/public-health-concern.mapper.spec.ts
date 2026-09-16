import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { mapHealthConcernEntityToListingContext } from './public-health-concern.mapper';

describe('mapHealthConcernEntityToListingContext medical SEO', () => {
  const base = {
    refId: 'HEA20260001',
    name: 'Hair Fall',
    slug: 'hair-fall',
    description: 'Shop hair fall products',
    icon: null,
    banner: null,
    metaTitle: 'Hair Fall Solutions',
    metaDescription: 'Meta',
    medicalConditionName: 'Androgenetic Alopecia',
    patientAudience: null,
    faqs: [],
    faqBanner: null,
  } as unknown as HealthConcernEntity;

  it('returns null medical SEO fields when unset', () => {
    const mapped = mapHealthConcernEntityToListingContext({
      ...base,
      alternateName: null,
      medicalConditionDescription: null,
      reviewedByName: null,
      reviewedByJobTitle: null,
      lastReviewed: null,
    } as HealthConcernEntity);

    expect(mapped.alternateName).toBeNull();
    expect(mapped.medicalConditionDescription).toBeNull();
    expect(mapped.reviewedByName).toBeNull();
    expect(mapped.reviewedByJobTitle).toBeNull();
    expect(mapped.lastReviewed).toBeNull();
  });

  it('serializes lastReviewed as YYYY-MM-DD', () => {
    const mapped = mapHealthConcernEntityToListingContext({
      ...base,
      alternateName: 'AGA',
      medicalConditionDescription: 'A common form of hair loss.',
      reviewedByName: 'Dr. Real',
      reviewedByJobTitle: 'Consulting Physician',
      lastReviewed: '2026-03-15',
    } as HealthConcernEntity);

    expect(mapped.alternateName).toBe('AGA');
    expect(mapped.lastReviewed).toBe('2026-03-15');
    expect(mapped.reviewedByName).toBe('Dr. Real');
  });
});
