import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiErrorResponse } from '@packages/common';
import { QueryFailedError } from 'typeorm';
import { UploadSizeLimitExceededError } from '@packages/storage';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    if (this.isUnicommerceAuthTokenRequest(request.url)) {
      this.logException(request, HttpStatus.OK, exception, 'INVALID_CREDENTIALS');
      void response
        .code(HttpStatus.OK)
        .header('Content-Type', 'application/json; charset=UTF-8')
        .send({ status: 'INVALID_CREDENTIALS' });
      return;
    }

    const normalized = this.normalizeException(exception);
    this.logException(request, normalized.statusCode, exception, normalized.message);

    const errorResponse: ApiErrorResponse = {
      success: false,
      statusCode: normalized.statusCode,
      error: normalized.error,
      message: normalized.message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    try {
      void response.status(normalized.statusCode).send(errorResponse);
    } catch (sendError) {
      this.logger.error(
        `Failed to send error response: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
        sendError instanceof Error ? sendError.stack : undefined,
      );
    }
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

    const fastifyError = this.normalizeFastifyError(exception);
    if (fastifyError) {
      return fastifyError;
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

  private normalizeFastifyError(exception: unknown): {
    statusCode: number;
    error: string;
    message: string;
  } | null {
    if (!(exception instanceof Error)) {
      return null;
    }

    const code = (exception as Error & { code?: string }).code;
    if (!code?.startsWith('FST_')) {
      return null;
    }

    const statusCode =
      (exception as Error & { statusCode?: number }).statusCode ?? HttpStatus.BAD_REQUEST;

    const messages: Record<string, string> = {
      FST_FILES_LIMIT:
        'Too many files in the upload. Reduce the number of image or file fields and try again.',
      FST_PARTS_LIMIT: 'The multipart request has too many parts.',
      FST_FIELDS_LIMIT: 'The multipart request has too many form fields.',
      FST_REQ_FILE_TOO_LARGE: 'One or more uploaded files exceed the maximum allowed size.',
      FST_INVALID_MULTIPART_CONTENT_TYPE: 'Request must use multipart/form-data.',
    };

    return {
      statusCode,
      error: HttpStatus[statusCode] ?? 'Error',
      message: messages[code] ?? exception.message,
    };
  }

  private isUnicommerceAuthTokenRequest(url: string): boolean {
    const path = url.split('?')[0] ?? url;
    return path.endsWith('/unicommerce/authToken');
  }

  private logException(
    request: FastifyRequest,
    statusCode: number,
    exception: unknown,
    message: string | string[],
  ): void {
    const err = exception instanceof Error ? exception : new Error(String(exception));
    const summary = `${request.method} ${request.url} -> ${statusCode}: ${
      Array.isArray(message) ? message.join(', ') : message
    }`;

    if (statusCode >= 500) {
      this.logger.error(summary, err.stack);
      return;
    }

    if (statusCode === HttpStatus.BAD_REQUEST) {
      this.logger.warn(summary);
    }
  }
}
