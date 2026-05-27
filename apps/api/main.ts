import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { APP_CONSTANTS } from '@packages/common';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false, // Pino handles logging
    }),
    // Suppress verbose NestJS bootstrap noise (InstanceLoader, RoutesResolver, etc.).
    // Pino takes over at info level after app.useLogger() is called below.
    { logger: ['warn', 'error'] },
  );

  // Use Pino logger
  app.useLogger(app.get(Logger));

  // Register cookie plugin — cast needed due to @fastify/cookie v11 type mismatch with @nestjs/platform-fastify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(fastifyCookie as any);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';

  // Global prefix
  app.setGlobalPrefix(APP_CONSTANTS.API_PREFIX);

  // Global pipes — validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // CORS
  if (nodeEnv !== 'production') {
    app.enableCors({
      origin: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`Application running on port ${port} in ${nodeEnv} mode`);
  logger.log(`API available at http://0.0.0.0:${port}/${APP_CONSTANTS.API_PREFIX}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
