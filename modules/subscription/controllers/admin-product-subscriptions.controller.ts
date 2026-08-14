import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  AdminProductSubscriptionQueryDto,
  AdminSubscriptionPaymentQueryDto,
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

  @ApiOperation({ summary: 'Get product subscription by id' })
  @ResponseMessage('Product subscription fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_product_subscriptions.read')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productSubscriptionsService.getAdmin(id);
  }
}
