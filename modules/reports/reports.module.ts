import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { RolesModule } from '@modules/roles/roles.module';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { ReportsRepository } from './repositories/reports.repository';
import { ReportExportService } from './services/report-export.service';
import { ReportsService } from './services/reports.service';

@Module({
  imports: [RolesModule, TypeOrmModule.forFeature([AdminUserEntity])],
  controllers: [AdminReportsController],
  providers: [ReportsRepository, ReportsService, ReportExportService],
})
export class ReportsModule {}
