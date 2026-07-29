import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'http';
import {
  LOG_IGNORE_PATH_FRAGMENTS,
  LOG_REDACT_PATHS,
  REQUEST_ID_HEADER,
} from './logging.constants';
import { resolveOrCreateRequestId } from './request-id.util';

function resolveLogLevel(nodeEnv: string | undefined, configured?: string): string {
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

function shouldIgnoreAccessLog(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const path = url.split('?')[0] ?? url;
  return LOG_IGNORE_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv =
          configService.get<string>('app.nodeEnv') ??
          configService.get<string>('NODE_ENV') ??
          'development';
        const configuredLevel =
          configService.get<string>('app.logLevel') ?? configService.get<string>('LOG_LEVEL');
        const level = resolveLogLevel(nodeEnv, configuredLevel);
        const usePretty = nodeEnv === 'development';

        return {
          pinoHttp: {
            level,
            quietReqLogger: true,
            transport: usePretty
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const id = resolveOrCreateRequestId(
                req.headers as Record<string, string | string[] | undefined>,
              );
              if (!res.headersSent) {
                res.setHeader(REQUEST_ID_HEADER, id);
              }
              return id;
            },
            customProps: (req: IncomingMessage) => ({
              requestId: (req as IncomingMessage & { id?: string }).id,
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
                id?: string;
                remoteAddress?: string;
                socket?: { remoteAddress?: string };
              }) => ({
                method: req.method,
                url: req.url?.split('?')[0] ?? req.url,
                id: req.id,
                remoteAddress: req.remoteAddress ?? req.socket?.remoteAddress,
              }),
              res: (res: { statusCode?: number }) => ({
                statusCode: res.statusCode,
              }),
            },
          },
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
