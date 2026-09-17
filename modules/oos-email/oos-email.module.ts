import { Module } from '@nestjs/common';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { MailService } from './services/mail.service';
import { OosEmailQueueService } from './services/oos-email-queue.service';
import { OosEmailProcessor } from './processors/oos-email.processor';

@Module({
  imports: [
    AdminSettingsModule,
    QueueModule.registerQueue(QUEUE_NAMES.OOS_EMAIL),
  ],
  providers: [MailService, OosEmailQueueService, OosEmailProcessor],
  exports: [OosEmailQueueService, MailService],
})
export class OosEmailModule {}
