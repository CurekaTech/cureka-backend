import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentAdminUser,
  IAdminJwtPayload,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { AdminOrderQueryDto, CancelOrderDto } from '../dto/order.dto';
import { OrdersService } from '../services/orders.service';

@ApiTags('Admin Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'List all orders (super admin)',
    description:
      'Paginated order list with search, status filters, date range, and sorting. Search matches order refId, order number, customer name/email/phone, product name, and grand total. ' +
      'Includes unpaid admin-created payment requests (`PAY…`, orderSource=Admin) until payment is captured and a real order is created. ' +
      'Each row includes status timestamps: placedAt, confirmedAt, processingAt, shippedAt, outForDeliveryAt, deliveredAt, cancelledAt, failedDeliveryAt, rtoAt.',
  })
  @ResponseMessage('Orders fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.ordersService.findAllForAdmin(query);
  }

  @ApiOperation({
    summary: 'Cancel an order (super admin)',
    description:
      'Cancels an order before shipping (PENDING / CONFIRMED / PROCESSING). ' +
      'Accepts order UUID (`id`) or business refId. Same stock/coupon rollback as customer cancel. ' +
      'GoKwik-linked orders are notified via Update Order (Cancelled + refund when applicable).',
  })
  @ResponseMessage('Order cancelled successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentAdminUser() admin: IAdminJwtPayload,
  ) {
    return this.ordersService.cancelForAdmin(id, dto, admin.sub);
  }

  @ApiOperation({
    summary: 'Get order detail (super admin)',
    description:
      'Returns full order detail including line items, customer, shipment tracking, and all status timestamps ' +
      '(placedAt, confirmedAt, processingAt, shippedAt, outForDeliveryAt, deliveredAt, cancelledAt, failedDeliveryAt, rtoAt). ' +
      'Accepts order UUID (`id`), order business refId (e.g. ORD2026123456), or admin payment-request refId (e.g. PAY2026123456). ' +
      'Payment-request IDs are used by the admin create-order wizard before payment is captured.',
  })
  @ResponseMessage('Order fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOneForAdmin(id);
  }
}
