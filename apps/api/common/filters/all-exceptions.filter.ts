import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiErrorResponse } from '@packages/common';
import { QueryFailedError } from 'typeorm';
import { UploadSizeLimitExceededError } from '@packages/storage';

type FastifyRequestWithLog = FastifyRequest & {
  log?: {
    error: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
  };
};

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequestWithLog>();

    const normalized = this.normalizeException(exception);
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const clientMessage =
      normalized.statusCode < 500 || !isProduction
        ? normalized.message
        : 'Internal server error';

    this.logException(request, normalized.statusCode, exception, normalized.message);

    const errorResponse: ApiErrorResponse = {
      success: false,
      statusCode: normalized.statusCode,
      error: normalized.error,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    void response.status(normalized.statusCode).send(errorResponse);
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof UploadSizeLimitExceededError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          error: HttpStatus[statusCode] ?? 'Error',
          message: exceptionResponse,
        };
      }

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const payload = exceptionResponse as { message?: string | string[]; error?: string };
        return {
          statusCode,
          error: payload.error ?? HttpStatus[statusCode] ?? 'Error',
          message: payload.message ?? exception.message,
        };
      }
    }

    if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError as { detail?: string; code?: string } | undefined;
      const detail = driverError?.detail ?? exception.message;
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Database Error',
        message: detail,
      };
    }

    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: exception.name || 'Error',
        message: exception.message || 'Internal server error',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: 'Internal server error',
    };
  }

  private logException(
    request: FastifyRequestWithLog,
    statusCode: number,
    exception: unknown,
    message: string | string[],
  ): void {
    const logPayload = {
      err: exception,
      statusCode,
      method: request.method,
      url: request.url,
      message,
    };

    if (statusCode >= 500) {
      request.log?.error(logPayload, 'Request failed with server error');
      return;
    }

    if (statusCode === HttpStatus.BAD_REQUEST) {
      request.log?.warn(logPayload, 'Request failed with bad request');
    }
  }
}
