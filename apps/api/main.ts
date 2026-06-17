import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { resolveUploadDir } from './config/storage.config';
import { APP_CONSTANTS } from '@packages/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap(): Promise<void> {
  // Read CORS config from process.env before the NestJS app is created so
  // @fastify/cors is registered on the raw Fastify instance BEFORE NestJS
  // mounts its routes. This is the only reliable way to apply CORS to all
  // routes in Fastify's plugin-scoped lifecycle. 
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const corsOriginsEnv = process.env['CORS_ORIGINS'];
  const uploadDir = resolveUploadDir(process.env['UPLOAD_DIR']);
  const uploadMaxFileSize = parseInt(process.env['UPLOAD_MAX_FILE_SIZE'] ?? '5242880', 10);
  const corsOrigin: string[] | true = corsOriginsEnv
    ? corsOriginsEnv
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean)
    : true; // when unset, reflect any origin (safe for development)

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    // Suppress verbose NestJS bootstrap noise (InstanceLoader, RoutesResolver, etc.).
    // Pino takes over at info level after app.useLogger() is called below.
    { logger: ['warn', 'error'] },
  );



  // @fastify/cors uses fastify-plugin internally, which breaks Fastify's
  // encapsulation — registering here (after create, before listen) makes it
  // global and applies to every route NestJS has registered.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app as any).register(fastifyCors, {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'ngrok-skip-browser-warning'],
    exposedHeaders: ['Set-Cookie'],
  });

  // Register cookie plugin — cast needed due to @fastify/cookie v11 type mismatch with @nestjs/platform-fastify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app as any).register(fastifyCookie);

  // Multipart uploads (Fastify-native; swap storage provider for GCS later)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app as any).register(fastifyMultipart, {
    limits: { fileSize: uploadMaxFileSize, files: 5 },
  });

  // Serve locally stored files when using local storage driver
  if ((process.env['STORAGE_DRIVER'] ?? 'local') === 'local') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (app as any).register(fastifyStatic, {
      root: uploadDir,
      prefix: '/uploads/',
      decorateReply: false,
    });
  }

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;

  app.setGlobalPrefix(APP_CONSTANTS.API_PREFIX);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cureka API')
    .setDescription('Healthcare eCommerce marketplace backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${APP_CONSTANTS.API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, swaggerConfig));

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

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  // Use Pino logger
  app.useLogger(app.get(Logger));
  
  const logger = app.get(Logger);
  logger.log(`Application running on port ${port} in ${nodeEnv} mode`);
  logger.log(`API available at http://0.0.0.0:${port}/${APP_CONSTANTS.API_PREFIX}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
