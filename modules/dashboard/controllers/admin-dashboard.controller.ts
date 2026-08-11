import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { DashboardQueryDto, DashboardViewAllQueryDto } from '../dto/dashboard-query.dto';
import { AdminDashboardService } from '../services/admin-dashboard.service';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @ApiOperation({
    summary: 'Dashboard overview (single API for homepage)',
    description:
      'Returns all dashboard widgets in one response. Use this for the main dashboard page. ' +
      'For View All screens, use /view-all/* endpoints.',
  })
  @ResponseMessage('Dashboard overview fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('overview')
  getOverview(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getOverview(query);
  }

  @ApiOperation({ summary: 'View All — top products (paginated)' })
  @ResponseMessage('Top products fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('view-all/top-products')
  getTopProductsViewAll(@Query() query: DashboardViewAllQueryDto) {
    return this.dashboardService.getTopProductsViewAll(query);
  }

  @ApiOperation({ summary: 'View All — recent activities (paginated)' })
  @ResponseMessage('Recent activities fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('view-all/recent-activities')
  getRecentActivitiesViewAll(@Query() query: DashboardViewAllQueryDto) {
    return this.dashboardService.getRecentActivitiesViewAll(query);
  }

  @ApiOperation({ summary: 'View All — brand performance (paginated)' })
  @ResponseMessage('Brand performance fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('view-all/brand-performance')
  getBrandPerformanceViewAll(@Query() query: DashboardViewAllQueryDto) {
    return this.dashboardService.getBrandPerformanceViewAll(query);
  }

  @ApiOperation({ summary: 'KPI summary cards' })
  @ResponseMessage('Dashboard KPIs fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('kpis')
  getKpis(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getKpis(query);
  }

  @ApiOperation({ summary: 'Revenue overview time series' })
  @ResponseMessage('Revenue overview fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('revenue-overview')
  getRevenueOverview(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRevenueOverview(query);
  }

  @ApiOperation({ summary: 'Orders by status breakdown' })
  @ResponseMessage('Orders by status fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('orders-by-status')
  getOrdersByStatus(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getOrdersByStatus(query);
  }

  @ApiOperation({ summary: 'Recent system activities feed' })
  @ResponseMessage('Recent activities fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('recent-activities')
  getRecentActivities(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRecentActivities(query);
  }

  @ApiOperation({ summary: 'Top performing products' })
  @ResponseMessage('Top products fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('top-products')
  getTopProducts(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getTopProducts(query);
  }

  @ApiOperation({
    summary: 'Customer analytics & retention metrics',
    description:
      'Returns bifurcated metrics: `customers` (isGuest=false) and `guests` (isGuest=true). ' +
      'Each side has new / repeat / retention / repeat-purchase cards.',
  })
  @ResponseMessage('Customer analytics fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('customer-analytics')
  getCustomerAnalytics(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getCustomerAnalytics(query);
  }

  @ApiOperation({ summary: 'Brand performance' })
  @ResponseMessage('Brand performance fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('brand-performance')
  getBrandPerformance(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getBrandPerformance(query);
  }

  @ApiOperation({ summary: 'Category performance (treemap)' })
  @ResponseMessage('Category performance fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('category-performance')
  getCategoryPerformance(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getCategoryPerformance(query);
  }

  @ApiOperation({ summary: 'Sales channels breakdown' })
  @ResponseMessage('Sales channels fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('sales-channels')
  getSalesChannels(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getSalesChannels(query);
  }

  @ApiOperation({ summary: 'Payment methods breakdown' })
  @ResponseMessage('Payment methods fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('payment-methods')
  getPaymentMethods(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getPaymentMethods(query);
  }

  @ApiOperation({
    summary: 'Search analytics',
    description: 'Placeholder until search logs are persisted.',
  })
  @ResponseMessage('Search analytics fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('search-analytics')
  getSearchAnalytics(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getSearchAnalytics(query);
  }

  @ApiOperation({
    summary: 'Marketing performance',
    description: 'Coupon usage is live; banner CTR is placeholder.',
  })
  @ResponseMessage('Marketing performance fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('marketing-performance')
  getMarketingPerformance(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getMarketingPerformance(query);
  }

  @ApiOperation({
    summary: 'Consultation analytics',
    description: 'Placeholder until doctor consultation module exists.',
  })
  @ResponseMessage('Consultation analytics fetched successfully')
  @RequirePermissions('dashboard.read')
  @Get('consultation-analytics')
  getConsultationAnalytics(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getConsultationAnalytics(query);
  }
}
