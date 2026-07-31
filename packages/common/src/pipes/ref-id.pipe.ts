import { BadRequestException, PipeTransform } from '@nestjs/common';
import { isValidRefId } from '../ref-id.util';

export class RefIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const normalized = value?.trim()?.toUpperCase() ?? '';
    if (!isValidRefId(normalized)) {
      throw new BadRequestException(
        'refId must be a valid code (11 or 13 chars), e.g. SUN20261234 or SUN2026123456',
      );
    }
    return normalized;
  }
}
