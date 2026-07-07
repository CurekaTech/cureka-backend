import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from 'nestjs-pino';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Workers don't expose HTTP — they process queues only
  console.log('Worker bootstrap: before app.init()');
  await app.init();
  console.log('Worker bootstrap: after app.init()');

  const logger = app.get(Logger);
  logger.log('Worker process started');
  console.log('Worker process started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during worker bootstrap:', err);
  process.exit(1);
});
