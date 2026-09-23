import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { AdminOrderHistoryQueryDto } from '../dto/order.dto';
import { OrderHistoryService } from '../services/order-history.service';

@ApiTags('Admin Order History')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/order-history')
export class AdminOrderHistoryController {
  constructor(private readonly orderHistoryService: OrderHistoryService) {}

  @ApiOperation({
    summary: 'List cancellation and return history',
    description:
      'Combined admin history of cancellation requests and return requests. ' +
      'This is the backend contract for the admin history page. ' +
      'Does not expose provider credentials or raw secrets. ' +
      'Requires `orders.read`.',
  })
  @ResponseMessage('Order history fetched successfully')
  @RequirePermissions('orders.read')
  @Get()
  list(@Query() query: AdminOrderHistoryQueryDto) {
    return this.orderHistoryService.list(query);
  }
}
