import { BadRequestException, PipeTransform } from '@nestjs/common';
import { isValidRefId } from '@packages/common';

export class RefIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidRefId(value)) {
      throw new BadRequestException('refId must be an 11-character code (e.g. SUN20261234)');
    }
    return value;
  }
}
