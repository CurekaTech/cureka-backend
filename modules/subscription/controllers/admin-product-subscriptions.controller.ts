import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  AdminProductSubscriptionQueryDto,
  AdminSubscriptionPaymentQueryDto,
  CancelProductSubscriptionDto,
  PauseProductSubscriptionDto,
} from '../dto/product-subscription.dto';
import { ProductSubscriptionPaymentsService } from '../services/product-subscription-payments.service';
import { ProductSubscriptionsService } from '../services/product-subscriptions.service';

@ApiTags('Admin Product Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/subscriptions/products')
export class AdminProductSubscriptionsController {
  constructor(
    private readonly productSubscriptionsService: ProductSubscriptionsService,
    private readonly paymentsService: ProductSubscriptionPaymentsService,
  ) {}

  @ApiOperation({ summary: 'List user product subscriptions' })
  @ResponseMessage('Product subscriptions fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.read')
  @Get()
  @HttpCode(HttpStatus.OK)
  list(@Query() query: AdminProductSubscriptionQueryDto) {
    return this.productSubscriptionsService.listAdmin(query);
  }

  @ApiOperation({ summary: 'List subscription payments' })
  @ResponseMessage('Subscription payments fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('subscription_payments.read')
  @Get('payments')
  @HttpCode(HttpStatus.OK)
  listPayments(@Query() query: AdminSubscriptionPaymentQueryDto) {
    return this.paymentsService.listAdmin(query);
  }

  @ApiOperation({ summary: 'Get product subscription by id or refId with mandate, cycles and history' })
  @ResponseMessage('Product subscription fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.read')
  @Get(':idOrRefId')
  @HttpCode(HttpStatus.OK)
  getOne(@Param('idOrRefId') idOrRefId: string) {
    return this.productSubscriptionsService.getAdmin(idOrRefId);
  }

  @ApiOperation({ summary: 'Pause a product subscription' })
  @ResponseMessage('Subscription paused successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.update')
  @Post(':idOrRefId/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @CurrentAdminUser() admin: IAdminJwtPayload,
    @Param('idOrRefId') idOrRefId: string,
    @Body() dto: PauseProductSubscriptionDto,
  ) {
    return this.productSubscriptionsService.adminPause(idOrRefId, admin.sub, dto.reason);
  }

  @ApiOperation({ summary: 'Resume a paused product subscription' })
  @ResponseMessage('Subscription resumed successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.update')
  @Post(':idOrRefId/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentAdminUser() admin: IAdminJwtPayload,
    @Param('idOrRefId') idOrRefId: string,
  ) {
    return this.productSubscriptionsService.adminResume(idOrRefId, admin.sub);
  }

  @ApiOperation({
    summary: 'Cancel future cycles. Does not cancel or refund already-paid orders.',
  })
  @ResponseMessage('Subscription cancelled successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.update')
  @Post(':idOrRefId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentAdminUser() admin: IAdminJwtPayload,
    @Param('idOrRefId') idOrRefId: string,
    @Body() dto: CancelProductSubscriptionDto,
  ) {
    return this.productSubscriptionsService.adminCancel(idOrRefId, admin.sub, dto.reason);
  }

  @ApiOperation({ summary: 'Skip the next unpaid billing cycle' })
  @ResponseMessage('Next delivery skipped successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.update')
  @Post(':idOrRefId/skip-next')
  @HttpCode(HttpStatus.OK)
  skipNext(
    @CurrentAdminUser() admin: IAdminJwtPayload,
    @Param('idOrRefId') idOrRefId: string,
  ) {
    return this.productSubscriptionsService.adminSkip(idOrRefId, admin.sub);
  }

  @ApiOperation({
    summary: 'Retry an unpaid cycle. Refused for paid, pending debit, or reconciling cycles.',
  })
  @ResponseMessage('Cycle retry queued')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.update')
  @Post(':idOrRefId/cycles/:cycleId/retry')
  @HttpCode(HttpStatus.OK)
  retryCycle(
    @CurrentAdminUser() admin: IAdminJwtPayload,
    @Param('idOrRefId') idOrRefId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.productSubscriptionsService.adminRetryCycle(idOrRefId, cycleId, admin.sub);
  }
}
