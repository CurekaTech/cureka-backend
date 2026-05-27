import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<boolean>('app.isProduction');
        return {
          pinoHttp: {
            level: configService.get<string>('app.logLevel') ?? 'info',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                },
            redact: {
              paths: ['req.headers.authorization', 'req.body.password', 'req.body.token'],
              remove: true,
            },
            serializers: {
              req: (req: { method: string; url: string; id: string }) => ({
                method: req.method,
                url: req.url,
                id: req.id,
              }),
            },
          },
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
