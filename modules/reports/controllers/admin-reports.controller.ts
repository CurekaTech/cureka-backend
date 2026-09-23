import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { RawResponse, ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ReportQueryDto } from '../dto/report-query.dto';
import { ReportExportService } from '../services/report-export.service';
import { ReportsService } from '../services/reports.service';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportExportService: ReportExportService,
  ) {}

  @ApiOperation({ summary: 'Sales & revenue report (summary + daily rows)' })
  @ResponseMessage('Sales & revenue report fetched successfully')
  @RequirePermissions('reports_sales_revenue.read')
  @Get('sales-revenue')
  getSalesRevenue(@Query() query: ReportQueryDto) {
    return this.reportsService.getSalesRevenue(query);
  }

  @ApiOperation({ summary: 'Order report (status summary + daily rows)' })
  @ResponseMessage('Order report fetched successfully')
  @RequirePermissions('reports_orders.read')
  @Get('orders')
  getOrders(@Query() query: ReportQueryDto) {
    return this.reportsService.getOrders(query);
  }

  @ApiOperation({ summary: 'Product performance report' })
  @ResponseMessage('Product performance report fetched successfully')
  @RequirePermissions('reports_product_performance.read')
  @Get('product-performance')
  getProductPerformance(@Query() query: ReportQueryDto) {
    return this.reportsService.getProductPerformance(query);
  }

  @ApiOperation({ summary: 'Inventory & stock report' })
  @ResponseMessage('Inventory & stock report fetched successfully')
  @RequirePermissions('reports_inventory_stock.read')
  @Get('inventory-stock')
  getInventoryStock(@Query() query: ReportQueryDto) {
    return this.reportsService.getInventoryStock(query);
  }

  @ApiOperation({ summary: 'Vendor performance report' })
  @ResponseMessage('Vendor performance report fetched successfully')
  @RequirePermissions('reports_vendor_performance.read')
  @Get('vendor-performance')
  getVendorPerformance(@Query() query: ReportQueryDto) {
    return this.reportsService.getVendorPerformance(query);
  }

  @ApiOperation({ summary: 'Customer report' })
  @ResponseMessage('Customer report fetched successfully')
  @RequirePermissions('reports_customers.read')
  @Get('customers')
  getCustomers(@Query() query: ReportQueryDto) {
    return this.reportsService.getCustomers(query);
  }

  @ApiOperation({ summary: 'Doctor consultation report (placeholder)' })
  @ResponseMessage('Consultation report fetched successfully')
  @RequirePermissions('reports_consultations.read')
  @Get('consultations')
  getConsultations(@Query() query: ReportQueryDto) {
    return this.reportsService.getConsultations(query);
  }

  @ApiOperation({ summary: 'Payment report' })
  @ResponseMessage('Payment report fetched successfully')
  @RequirePermissions('reports_payments.read')
  @Get('payments')
  getPayments(@Query() query: ReportQueryDto) {
    return this.reportsService.getPayments(query);
  }

  @ApiOperation({ summary: 'Return, refund & replacement report' })
  @ResponseMessage('Return & refund report fetched successfully')
  @RequirePermissions('reports_returns_refunds.read')
  @Get('returns-refunds')
  getReturnsRefunds(@Query() query: ReportQueryDto) {
    return this.reportsService.getReturnsRefunds(query);
  }

  @ApiOperation({ summary: 'Coupon & promotion report' })
  @ResponseMessage('Coupon report fetched successfully')
  @RequirePermissions('reports_coupons.read')
  @Get('coupons')
  getCoupons(@Query() query: ReportQueryDto) {
    return this.reportsService.getCoupons(query);
  }

  @ApiOperation({ summary: 'Download sales & revenue report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_sales_revenue.export')
  @Get('sales-revenue/export')
  async exportSalesRevenue(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getSalesRevenueExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildSalesRevenueWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download order report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_orders.export')
  @Get('orders/export')
  async exportOrders(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getOrdersExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildOrderWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download product performance report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_product_performance.export')
  @Get('product-performance/export')
  async exportProductPerformance(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getProductPerformanceExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildProductPerformanceWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download inventory & stock report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_inventory_stock.export')
  @Get('inventory-stock/export')
  async exportInventoryStock(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getInventoryExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildInventoryWorkbook(rows);
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download vendor performance report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_vendor_performance.export')
  @Get('vendor-performance/export')
  async exportVendorPerformance(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getVendorPerformanceExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildVendorPerformanceWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download customer report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_customers.export')
  @Get('customers/export')
  async exportCustomers(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getCustomerExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildCustomerWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download payment report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_payments.export')
  @Get('payments/export')
  async exportPayments(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getPaymentExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildPaymentWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download return & refund report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_returns_refunds.export')
  @Get('returns-refunds/export')
  async exportReturnsRefunds(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getReturnRefundExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildReturnRefundWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Download coupon report as XLSX' })
  @RawResponse()
  @RequirePermissions('reports_coupons.export')
  @Get('coupons/export')
  async exportCoupons(@Query() query: ReportQueryDto, @Res() reply: FastifyReply) {
    const rows = await this.reportsService.getCouponExportRows(query);
    const { fileName, fileBuffer } = await this.reportExportService.buildCouponWorkbook(
      rows,
      query.startDate,
      query.endDate,
    );
    return this.sendWorkbook(reply, fileName, fileBuffer);
  }

  private sendWorkbook(reply: FastifyReply, fileName: string, fileBuffer: Buffer) {
    return reply
      .code(200)
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(fileBuffer);
  }
}
