import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { AppModule } from './app.module';
import { resolveUploadDir } from './config/storage.config';
import { APP_CONSTANTS } from '@packages/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
async function bootstrap(): Promise<void> {
  // Read CORS config from process.env before the NestJS app is created so
  // @fastify/cors is registered on the raw Fastify instance BEFORE NestJS
  // mounts its routes. This is the only reliable way to apply CORS to all
  // routes in Fastify's plugin-scoped lifecycle.
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const corsOriginsEnv =
    process.env['CORS_ORIGINS']?.trim() ||
    'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://localhost:3001,http://localhost:3002';
  const uploadDir = resolveUploadDir(process.env['UPLOAD_DIR']);
  const uploadMaxFileSize = parseInt(process.env['UPLOAD_MAX_VIDEO_FILE_SIZE'] ?? '20971520', 10);
  const uploadMaxMultipartFiles = parseInt(
    process.env['UPLOAD_MAX_MULTIPART_FILES'] ?? String(APP_CONSTANTS.DEFAULT_MAX_MULTIPART_FILES),
    10,
  );
  const corsOrigin: string[] | true = corsOriginsEnv
    ? corsOriginsEnv
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    : true; // when unset, reflect any origin (safe for development)

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      maxParamLength: APP_CONSTANTS.FASTIFY_MAX_PARAM_LENGTH,
      // Honor X-Forwarded-For / X-Real-IP from nginx so OTP IP rate limits
      // are per client, not per load-balancer hop.
      trustProxy: true,
    }),
    // Suppress verbose NestJS bootstrap noise (InstanceLoader, RoutesResolver, etc.).
    // Pino takes over at info level after app.useLogger() is called below.
    { logger: ['warn', 'error'], rawBody: true },
  );

  // @fastify/cors uses fastify-plugin internally, which breaks Fastify's
  // encapsulation — registering here (after create, before listen) makes it
  // global and applies to every route NestJS has registered.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app as any).register(fastifyCors, {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'apikey',
      'apiKey',
      'Cookie',
      'ngrok-skip-browser-warning',
      'x-request-id',
      'x-correlation-id',
      'x-guest-id',
      'x-bob-api-key',
    ],
    exposedHeaders: ['Set-Cookie', 'Content-Disposition', 'Content-Length'],
  });

  // Register cookie plugin — cast needed due to @fastify/cookie v11 type mismatch with @nestjs/platform-fastify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app as any).register(fastifyCookie);

  // Multipart uploads (Fastify-native; swap storage provider for GCS later)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app as any).register(fastifyMultipart, {
    limits: { fileSize: uploadMaxFileSize, files: uploadMaxMultipartFiles },
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
  SwaggerModule.setup(
    `${APP_CONSTANTS.API_PREFIX}/docs`,
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  // Bridge Nest Logger → Pino before listen so early request/bootstrap logs are structured.
  app.useLogger(app.get(Logger));

  await app.listen(port, '0.0.0.0');

  // PM2 wait_ready: signal that this cluster worker can receive traffic.
  if (process.send) {
    process.send('ready');
  }

  const logger = app.get(Logger);
  logger.log(`Application running on port ${port} in ${nodeEnv} mode`);
  logger.log(`API available at http://0.0.0.0:${port}/${APP_CONSTANTS.API_PREFIX}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
