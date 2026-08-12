import { Module } from '@nestjs/common';
import { RolesModule } from '@modules/roles/roles.module';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { ReportsPhase2Repository } from './repositories/reports-phase2.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { OrderReportService } from './services/order-report.service';
import { Phase2ReportsService } from './services/phase2-reports.service';
import { ReportExportService } from './services/report-export.service';
import { SalesRevenueReportService } from './services/sales-revenue-report.service';

@Module({
  imports: [RolesModule],
  controllers: [AdminReportsController],
  providers: [
    ReportsRepository,
    ReportsPhase2Repository,
    SalesRevenueReportService,
    OrderReportService,
    Phase2ReportsService,
    ReportExportService,
  ],
})
export class ReportsModule {}

