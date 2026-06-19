import {
  BadRequestException,
  Injectable,
  Logger,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { formatValidationErrorMessage, formatValidationErrorsForLog } from '../validation-error.util';

@Injectable()
export class LoggingValidationPipe extends ValidationPipe {
  private readonly logger = new Logger(LoggingValidationPipe.name);

  constructor(options?: ValidationPipeOptions) {
    super({
      ...options,
      exceptionFactory: (errors: ValidationError[]) => {
        this.logger.warn(`DTO validation failed: ${formatValidationErrorsForLog(errors)}`);
        return new BadRequestException(formatValidationErrorMessage(errors));
      },
    });
  }
}
