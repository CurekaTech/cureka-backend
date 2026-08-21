import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LOG_SERVICE_NAME } from './logging.constants';
import { buildPinoHttpOptions, resolveLogLevel } from './pino-http.options';

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
        const service =
          configService.get<string>('app.serviceName') ??
          configService.get<string>('LOG_SERVICE_NAME') ??
          LOG_SERVICE_NAME;
        const environment =
          configService.get<string>('app.environment') ??
          configService.get<string>('APP_ENV') ??
          nodeEnv;

        return {
          pinoHttp: buildPinoHttpOptions({
            nodeEnv,
            level,
            service,
            environment,
          }),
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
