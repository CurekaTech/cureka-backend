import { BadRequestException } from '@nestjs/common';

export const FAQ_QUESTION_MAX_LENGTH = 250;
export const FAQ_ANSWER_MAX_LENGTH = 1000;

export const FAQ_QUESTION_MAX_LENGTH_MESSAGE = `FAQ question must be at most ${FAQ_QUESTION_MAX_LENGTH} characters`;
export const FAQ_ANSWER_MAX_LENGTH_MESSAGE = `FAQ answer must be at most ${FAQ_ANSWER_MAX_LENGTH} characters`;
export const FAQ_QUESTION_REQUIRED_MESSAGE = 'FAQ question is required';
export const FAQ_ANSWER_REQUIRED_MESSAGE = 'FAQ answer is required';

export type MasterFaqItem = { question: string; answer: string; sequence: number };

export type FaqSequenceInput = { sequence?: number | null };

export const resolveFaqSequence = (sequence: number | null | undefined, fallbackIndex: number): number => {
  if (typeof sequence === 'number' && Number.isInteger(sequence) && sequence >= 0) {
    return sequence;
  }
  return fallbackIndex;
};

export const sortFaqsBySequence = <T extends FaqSequenceInput>(
  faqs: T[],
): T[] => {
  return faqs
    .map((faq, index) => ({ faq, index }))
    .sort((left, right) => {
      const leftSeq = resolveFaqSequence(left.faq.sequence, left.index);
      const rightSeq = resolveFaqSequence(right.faq.sequence, right.index);
      if (leftSeq !== rightSeq) return leftSeq - rightSeq;
      return left.index - right.index;
    })
    .map(({ faq }) => faq);
};

export const assertFaqLengths = (question: string, answer: string, index?: number): void => {
  const prefix = index === undefined ? 'FAQ' : `FAQ #${index + 1}`;
  if (question.length > FAQ_QUESTION_MAX_LENGTH) {
    throw new BadRequestException(
      `${prefix} question must be at most ${FAQ_QUESTION_MAX_LENGTH} characters`,
    );
  }
  if (answer.length > FAQ_ANSWER_MAX_LENGTH) {
    throw new BadRequestException(
      `${prefix} answer must be at most ${FAQ_ANSWER_MAX_LENGTH} characters`,
    );
  }
};

/**
 * Normalize FAQ arrays for persistence.
 * Filters out empty question/answer pairs after trim and enforces length limits.
 * Assigns `sequence` from payload or array index; stores sorted by sequence.
 */
export const normalizeMasterFaqs = (
  faqs?: Array<{ question: string; answer: string; sequence?: number | null }> | null,
): MasterFaqItem[] => {
  if (!faqs?.length) return [];
  const normalized = faqs
    .map((faq, index) => {
      const question = faq.question?.trim() ?? '';
      const answer = faq.answer?.trim() ?? '';
      if (question || answer) {
        assertFaqLengths(question, answer, index);
      }
      return {
        question,
        answer,
        sequence: resolveFaqSequence(faq.sequence, index),
      };
    })
    .filter((faq) => faq.question && faq.answer);

  return sortFaqsBySequence(normalized).map((faq) => ({
    question: faq.question,
    answer: faq.answer,
    sequence: faq.sequence,
  }));
};

export const mapMasterFaqs = (
  faqs?: Array<{ question: string; answer: string; sequence?: number | null }> | null,
): MasterFaqItem[] => {
  if (!faqs?.length) return [];
  const mapped = faqs
    .map((faq, index) => ({
      question: faq.question?.trim() ?? '',
      answer: faq.answer?.trim() ?? '',
      sequence: resolveFaqSequence(faq.sequence, index),
    }))
    .filter((faq) => faq.question && faq.answer);

  return sortFaqsBySequence(mapped).map((faq) => ({
    question: faq.question,
    answer: faq.answer,
    sequence: faq.sequence,
  }));
};

export const normalizeVariantInlineFaqs = (
  faqs: Array<{ question: string; answer: string; sequence?: number | null }>,
): MasterFaqItem[] => normalizeMasterFaqs(faqs);
