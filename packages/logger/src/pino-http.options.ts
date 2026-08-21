import { IncomingMessage, ServerResponse } from 'http';
import type { Options } from 'pino-http';
import {
  LOG_IGNORE_PATH_FRAGMENTS,
  LOG_REDACT_PATHS,
  LOG_SERVICE_NAME,
  REQUEST_ID_HEADER,
} from './logging.constants';
import { resolveOrCreateRequestId } from './request-id.util';

export type LoggerRuntimeConfig = {
  nodeEnv: string;
  level: string;
  service?: string;
  environment?: string;
};

const GCP_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export function resolveLogLevel(nodeEnv: string | undefined, configured?: string): string {
  if (nodeEnv === 'test') {
    return 'silent';
  }
  if (configured?.trim()) {
    return configured.trim();
  }
  if (nodeEnv === 'development') {
    return 'debug';
  }
  return 'info';
}

/** Pretty-print only for local development. Production, staging, and beta emit JSON. */
export function shouldUsePrettyLogs(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'development';
}

export function requestPathFromUrl(url: string | undefined): string | undefined {
  return url?.split('?')[0] ?? url;
}

export function shouldIgnoreAccessLog(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const path = requestPathFromUrl(url) ?? url;
  return LOG_IGNORE_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

function gcpSeverity(label: string): string {
  return GCP_SEVERITY[label] ?? 'DEFAULT';
}

function requestIdOf(req: IncomingMessage): string | undefined {
  const id = req.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

function withHttpFields(
  req: IncomingMessage,
  res: ServerResponse,
  val: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...val,
    method: req.method,
    path: requestPathFromUrl(req.url),
    statusCode: res.statusCode,
  };
}

/**
 * pino-http options shared by nestjs-pino.
 * Writes newline-delimited JSON to stdout (Pino default) in non-development envs.
 */
export function buildPinoHttpOptions(config: LoggerRuntimeConfig): Options {
  const service = config.service?.trim() || LOG_SERVICE_NAME;
  const environment = config.environment?.trim() || config.nodeEnv || 'development';
  const usePretty = shouldUsePrettyLogs(config.nodeEnv);

  return {
    level: config.level,
    quietReqLogger: true,
    messageKey: 'message',
    base: {
      pid: process.pid,
      service,
      environment,
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    formatters: {
      level: (label: string) => ({
        level: label,
        severity: gcpSeverity(label),
      }),
    },
    transport: usePretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageKey: 'message',
          },
        }
      : undefined,
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = requestIdOf(req);
      const id = existing ?? resolveOrCreateRequestId(req.headers);
      if (!res.headersSent) {
        res.setHeader(REQUEST_ID_HEADER, id);
      }
      return id;
    },
    customAttributeKeys: {
      reqId: 'requestId',
      responseTime: 'responseTimeMs',
    },
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request errored',
    customSuccessObject: (req, res, val) => withHttpFields(req, res, val as Record<string, unknown>),
    customErrorObject: (req, res, _error, val) =>
      withHttpFields(req, res, val as Record<string, unknown>),
    customProps: () => ({
      context: 'http',
    }),
    customLogLevel: (
      _req: IncomingMessage,
      res: ServerResponse,
      err?: Error,
    ): 'error' | 'warn' | 'info' => {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    autoLogging: {
      ignore: (req: IncomingMessage) => shouldIgnoreAccessLog(req.url),
    },
    redact: {
      paths: LOG_REDACT_PATHS,
      remove: true,
    },
    serializers: {
      req: (req: {
        method?: string;
        url?: string;
        id?: string | number;
        remoteAddress?: string;
        socket?: { remoteAddress?: string };
      }) => ({
        method: req.method,
        url: requestPathFromUrl(req.url),
        id: req.id,
        remoteAddress: req.remoteAddress ?? req.socket?.remoteAddress,
      }),
      res: (res: { statusCode?: number }) => ({
        statusCode: res.statusCode,
      }),
    },
  };
}
