import { BadRequestException } from '@nestjs/common';

export const FAQ_QUESTION_MAX_LENGTH = 250;
export const FAQ_ANSWER_MAX_LENGTH = 1000;

export const FAQ_QUESTION_MAX_LENGTH_MESSAGE = `FAQ question must be at most ${FAQ_QUESTION_MAX_LENGTH} characters`;
export const FAQ_ANSWER_MAX_LENGTH_MESSAGE = `FAQ answer must be at most ${FAQ_ANSWER_MAX_LENGTH} characters`;

export type MasterFaqItem = { question: string; answer: string };

export const assertFaqLengths = (question: string, answer: string, index?: number): void => {
  const prefix = index === undefined ? 'FAQ' : `FAQ #${index + 1}`;
  if (question.length > FAQ_QUESTION_MAX_LENGTH) {
    throw new BadRequestException(
      `${prefix} question must be at most ${FAQ_QUESTION_MAX_LENGTH} characters (got ${question.length})`,
    );
  }
  if (answer.length > FAQ_ANSWER_MAX_LENGTH) {
    throw new BadRequestException(
      `${prefix} answer must be at most ${FAQ_ANSWER_MAX_LENGTH} characters (got ${answer.length})`,
    );
  }
};

/**
 * Normalize FAQ arrays for persistence.
 * Filters out empty question/answer pairs after trim and enforces length limits.
 */
export const normalizeMasterFaqs = (
  faqs?: Array<{ question: string; answer: string }> | null,
): MasterFaqItem[] => {
  if (!faqs?.length) return [];
  return faqs
    .map((faq, index) => {
      const question = faq.question?.trim() ?? '';
      const answer = faq.answer?.trim() ?? '';
      if (question || answer) {
        assertFaqLengths(question, answer, index);
      }
      return { question, answer };
    })
    .filter((faq) => faq.question && faq.answer);
};

export const mapMasterFaqs = (
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
