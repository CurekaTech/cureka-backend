/**
 * Dedicated image-derivative worker. Does not bind an HTTP port.
 *
 *   IMAGE_WORKER_ENABLED=true IMAGE_PROCESSING_ENABLED=true npm run start:image-worker
 *
 * Keep this process off the API cluster. Encoding concurrency is per process.
 */
process.env['IMAGE_WORKER_ENABLED'] = process.env['IMAGE_WORKER_ENABLED'] ?? 'true';

async function bootstrap(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { Logger } = await import('nestjs-pino');
  const { ImageWorkerModule } = await import('./image-worker.module');

  const app = await NestFactory.createApplicationContext(ImageWorkerModule, {
    bufferLogs: true,
    logger: ['warn', 'error'],
  });

  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);
  logger.log('Image pipeline worker started (no HTTP server)');

  if (process.send) {
    process.send('ready');
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during image worker bootstrap:', err);
  process.exit(1);
});
