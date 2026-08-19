import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { AdminAbandonedCartQueryDto } from '../dto/abandoned-cart.dto';
import { AdminAbandonedCartsService } from '../services/admin-abandoned-carts.service';

@ApiTags('Admin Abandoned Carts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/abandoned-carts')
export class AdminAbandonedCartsController {
  constructor(private readonly abandonedCartsService: AdminAbandonedCartsService) {}

  @ApiOperation({
    summary: 'List abandoned carts',
    description:
      'Active carts that still have items (user added products and did not complete purchase). ' +
      'Successful checkout clears the cart, so those rows drop off this list automatically. ' +
      'Search matches customer name and mobile number. Date range filters last cart activity. ' +
      'Sort by lastActivityAt, totalAmount, customerName, mobileNumber, or createdAt.',
  })
  @ResponseMessage('Abandoned carts fetched successfully')
  @RequirePermissions('abandoned_carts.read')
  @Get()
  findAll(@Query() query: AdminAbandonedCartQueryDto) {
    return this.abandonedCartsService.findAll(query);
  }

  @ApiOperation({
    summary: 'Get abandoned cart detail',
    description:
      'Customer profile, saved addresses, and full cart (products, variants, images, coupon, totals). ' +
      'Accepts cart UUID (`id`) or business refId.',
  })
  @ResponseMessage('Abandoned cart fetched successfully')
  @RequirePermissions('abandoned_carts.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.abandonedCartsService.findOne(id);
  }
}
