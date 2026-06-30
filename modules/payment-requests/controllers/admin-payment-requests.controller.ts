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
  PaymentRequestQueryDto,
  UpdatePaymentRequestDto,
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

  @ApiOperation({ summary: 'Create payment request' })
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

  @ApiOperation({ summary: 'List payment requests' })
  @ResponseMessage('Payment requests fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.read')
  @Get()
  findAll(@Query() query: PaymentRequestQueryDto) {
    return this.paymentRequestsService.findAll(query);
  }

  @ApiOperation({ summary: 'Get payment request detail' })
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
  generateLink(@Param('id') id: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.paymentRequestsService.generateLink(id, user.email);
  }

  @ApiOperation({ summary: 'Regenerate payment link' })
  @ResponseMessage('Payment link regenerated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, 'telecaller')
  @RequirePermissions('payment-request.regenerate')
  @Post(':id/regenerate-link')
  regenerateLink(@Param('id') id: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.paymentRequestsService.regenerateLink(id, user.email);
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
