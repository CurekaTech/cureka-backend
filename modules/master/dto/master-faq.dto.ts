import { ApiProperty } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_ANSWER_MAX_LENGTH_MESSAGE,
  FAQ_ANSWER_REQUIRED_MESSAGE,
  FAQ_QUESTION_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH_MESSAGE,
  FAQ_QUESTION_REQUIRED_MESSAGE,
} from '../utils/master-faq.util';

export class MasterFaqDto {
  @ApiProperty({
    example: 'Is COD available in this area?',
    maxLength: FAQ_QUESTION_MAX_LENGTH,
  })
  @IsNotEmpty({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @MaxLength(FAQ_QUESTION_MAX_LENGTH, { message: FAQ_QUESTION_MAX_LENGTH_MESSAGE })
  question!: string;

  @ApiProperty({
    example: 'COD availability depends on pincode and product type.',
    maxLength: FAQ_ANSWER_MAX_LENGTH,
  })
  @IsNotEmpty({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @MaxLength(FAQ_ANSWER_MAX_LENGTH, { message: FAQ_ANSWER_MAX_LENGTH_MESSAGE })
  answer!: string;
}

/**
 * Multipart mergeFormFields JSON.stringifies nested arrays.
 * Parse them back and return MasterFaqDto instances so ValidateNested works.
 * Empty question/answer items are kept so class-validator can reject them.
 */
export const parseMasterFaqArray = ({
  value,
}: {
  value: unknown;
}): MasterFaqDto[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;

  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(parsed)) return undefined;

  const items = parsed
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      question: String(item.question ?? '').trim(),
      answer: String(item.answer ?? '').trim(),
    }));

  return plainToInstance(MasterFaqDto, items);
};
