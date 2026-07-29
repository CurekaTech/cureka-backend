import type { Logger as PinoRootLogger } from 'pino';
import type { PinoLogger } from 'nestjs-pino';

export type JobLoggerBindings = {
  jobId?: string | number | null;
  jobName?: string;
  queue?: string;
  uploadRefId?: string;
  orderId?: string;
  productRefId?: string;
  resourceId?: string;
  eventId?: string;
  [key: string]: unknown;
};

/**
 * Nest Logger-compatible facade over a pino child logger.
 * Maps Nest `.log()` → pino `.info()` so existing call sites stay unchanged.
 */
export type JobLogger = {
  log(message: unknown, ...optionalParams: unknown[]): void;
  info(message: unknown, ...optionalParams: unknown[]): void;
  warn(message: unknown, ...optionalParams: unknown[]): void;
  error(message: unknown, ...optionalParams: unknown[]): void;
  debug(message: unknown, ...optionalParams: unknown[]): void;
};

export function adaptPinoToNestStyle(logger: PinoRootLogger): JobLogger {
  const call = (
    level: 'info' | 'warn' | 'error' | 'debug',
    message: unknown,
    ...optionalParams: unknown[]
  ): void => {
    if (
      typeof message === 'object' &&
      message !== null &&
      optionalParams.length > 0 &&
      typeof optionalParams[0] === 'string'
    ) {
      logger[level](message, optionalParams[0]);
      return;
    }

    if (typeof message === 'string' && optionalParams.length > 0) {
      if (level === 'error' && typeof optionalParams[0] === 'string') {
        logger.error({ err: { message: optionalParams[0], stack: optionalParams[0] } }, message);
        return;
      }
      if (optionalParams[0] instanceof Error) {
        logger[level]({ err: optionalParams[0] }, message);
        return;
      }
      logger[level]({ detail: optionalParams[0] }, message);
      return;
    }

    if (typeof message === 'object' && message !== null) {
      logger[level](message);
      return;
    }

    logger[level](String(message));
  };

  return {
    log: (message, ...rest) => call('info', message, ...rest),
    info: (message, ...rest) => call('info', message, ...rest),
    warn: (message, ...rest) => call('warn', message, ...rest),
    error: (message, ...rest) => call('error', message, ...rest),
    debug: (message, ...rest) => call('debug', message, ...rest),
  };
}

/**
 * Create a Nest-style job logger bound to BullMQ job metadata.
 * Prefer this over PinoLogger.assign() in processors so concurrent jobs do not leak bindings.
 */
export function createJobLogger(
  logger: PinoLogger,
  bindings: JobLoggerBindings,
): JobLogger {
  const cleaned: Record<string, unknown> = { context: 'worker' };

  for (const [key, value] of Object.entries(bindings)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }

  return adaptPinoToNestStyle(logger.logger.child(cleaned));
}
