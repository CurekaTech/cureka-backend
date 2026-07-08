import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { AdminOrderQueryDto } from '../dto/order.dto';
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
      'Paginated order list with search, status filters, date range, and sorting. Search matches order refId, order number, customer name/email/phone, product name, and grand total.',
  })
  @ResponseMessage('Orders fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.ordersService.findAllForAdmin(query);
  }

  @ApiOperation({
    summary: 'Get order detail (super admin)',
    description:
      'Returns full order detail including line items, customer, and shipment tracking. Accepts order UUID (`id`) or business refId (e.g. order20261234).',
  })
  @ResponseMessage('Order fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOneForAdmin(id);
  }
}
