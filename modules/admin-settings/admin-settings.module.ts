import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSettingEntity } from './entities/admin-setting.entity';
import { AdminSettingsRepository } from './repositories/admin-settings.repository';
import { AdminSettingsService } from './services/admin-settings.service';
import { AdminSettingsController } from './controllers/admin-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdminSettingEntity])],
  providers: [AdminSettingsRepository, AdminSettingsService],
  controllers: [AdminSettingsController],
  exports: [AdminSettingsService, AdminSettingsRepository],
})
export class AdminSettingsModule {}
