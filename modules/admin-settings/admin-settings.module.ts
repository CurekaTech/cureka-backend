import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { AdminSettingEntity } from './entities/admin-setting.entity';
import { AdminNotificationEmailEntity } from './entities/admin-notification-email.entity';
import { AdminSettingsRepository } from './repositories/admin-settings.repository';
import { AdminNotificationEmailsRepository } from './repositories/admin-notification-emails.repository';
import { AdminSettingsService } from './services/admin-settings.service';
import { AdminNotificationEmailsService } from './services/admin-notification-emails.service';
import { AdminSettingsController } from './controllers/admin-settings.controller';
import { AdminNotificationEmailsController } from './controllers/admin-notification-emails.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminSettingEntity,
      AdminNotificationEmailEntity,
      AdminUserEntity,
    ]),
  ],
  providers: [
    AdminSettingsRepository,
    AdminSettingsService,
    AdminNotificationEmailsRepository,
    AdminNotificationEmailsService,
  ],
  controllers: [AdminSettingsController, AdminNotificationEmailsController],
  exports: [
    AdminSettingsService,
    AdminSettingsRepository,
    AdminNotificationEmailsService,
    AdminNotificationEmailsRepository,
  ],
})
export class AdminSettingsModule {}
