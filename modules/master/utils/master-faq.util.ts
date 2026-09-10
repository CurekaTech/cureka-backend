export type MasterFaqItem = { question: string; answer: string };

/**
 * Normalize FAQ arrays for persistence.
 * Filters out empty question/answer pairs after trim.
 */
export const normalizeMasterFaqs = (
  faqs?: Array<{ question: string; answer: string }> | null,
): MasterFaqItem[] => {
  if (!faqs?.length) return [];
  return faqs
    .map((faq) => ({
      question: faq.question?.trim() ?? '',
      answer: faq.answer?.trim() ?? '',
    }))
    .filter((faq) => faq.question && faq.answer);
};

export const mapMasterFaqs = (
  faqs?: Array<{ question: string; answer: string }> | null,
): MasterFaqItem[] => normalizeMasterFaqs(faqs ?? []);
