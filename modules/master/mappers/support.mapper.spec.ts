import { SupportFaqEntity } from '../entities/support-faq.entity';
import { mapStorefrontFaq } from './support.mapper';

describe('support.mapper storefront FAQ', () => {
  it('includes sortOrder on public payload', () => {
    const entity = {
      refId: 'FAQ20260001',
      question: 'Q',
      answer: 'A',
      categoryRefId: 'CAT1',
      sortOrder: 3,
    } as SupportFaqEntity;

    expect(mapStorefrontFaq(entity)).toEqual({
      refId: 'FAQ20260001',
      question: 'Q',
      answer: 'A',
      categoryRefId: 'CAT1',
      sortOrder: 3,
    });
  });
});
