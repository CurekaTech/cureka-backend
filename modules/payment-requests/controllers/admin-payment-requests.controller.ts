import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  CreatePaymentRequestDto,
  GenerateLinkPrefillDto,
  PaymentRequestQueryDto,
  UpdatePaymentRequestDto,
  ValidateAdminCouponDto,
} from '../dto/payment-request.dto';
import { PaymentRequestsService } from '../services/payment-requests.service';

@ApiTags('Admin Payment Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/payment-requests')
export class AdminPaymentRequestsController {
  constructor(private readonly paymentRequestsService: PaymentRequestsService) {}

  @ApiOperation({ summary: 'Lightweight product variant search for payment request creation wizard' })
  @ResponseMessage('Products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.read')
  @Get('product-search')
  productSearch(
    @Query('search') search: string,
    @Query('limit') limit?: number,
  ) {
    return this.paymentRequestsService.searchProducts(search || '', limit ? Number(limit) : undefined);
  }

  @ApiOperation({ summary: 'Validate coupon for order/payment request items' })
  @ResponseMessage('Coupon validated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.create')
  @Post('validate-coupon')
  validateCoupon(@Body() dto: ValidateAdminCouponDto) {
    return this.paymentRequestsService.validateAdminCoupon(dto);
  }

  @ApiOperation({
    summary: 'Create payment request / admin order',
    description:
      'Admin create-order wizard. Pass `paymentMethod`: `PREPAID` (default) or `COD`. ' +
      'Prepaid stays PAYMENT_PENDING until a payment link is paid. ' +
      'COD requires a delivery address and immediately creates a confirmed order (payment remains pending until delivery). Do not generate a payment link for COD.',
  })
  @ResponseMessage('Payment request created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.create')
  @Post()
  create(@Body() dto: CreatePaymentRequestDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.paymentRequestsService.create(dto, user.email);
  }


  @ApiOperation({ summary: 'Update payment request' })
  @ResponseMessage('Payment request updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.update')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.paymentRequestsService.update(id, dto, user.email);
  }

  @ApiOperation({
    summary: 'List payment requests (includes storefront COD orders)',
    description:
      'Returns payment_requests plus COD rows from orders. COD rows have recordType=COD_ORDER and paymentProvider=COD.',
  })
  @ResponseMessage('Payment requests fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.read')
  @Get()
  findAll(@Query() query: PaymentRequestQueryDto) {
    return this.paymentRequestsService.findAll(query);
  }

  @ApiOperation({
    summary: 'Get payment request detail',
    description: 'Also resolves COD orders by order UUID / refId / orderNumber.',
  })
  @ResponseMessage('Payment request fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentRequestsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cancel payment request' })
  @ResponseMessage('Payment request cancelled successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.cancel')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.paymentRequestsService.cancel(id, user.email);
  }

  @ApiOperation({ summary: 'Generate payment link' })
  @ResponseMessage('Payment link generated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.generate-link')
  @Post(':id/generate-link')
  generateLink(
    @Param('id') id: string,
    @Body() dto: GenerateLinkPrefillDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.paymentRequestsService.generateLink(id, user.email, dto);
  }

  @ApiOperation({ summary: 'Regenerate payment link' })
  @ResponseMessage('Payment link regenerated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.regenerate')
  @Post(':id/regenerate-link')
  regenerateLink(
    @Param('id') id: string,
    @Body() dto: GenerateLinkPrefillDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.paymentRequestsService.regenerateLink(id, user.email, dto);
  }

  @ApiOperation({ summary: 'Soft delete payment request' })
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.paymentRequestsService.softDelete(id);
  }
}
