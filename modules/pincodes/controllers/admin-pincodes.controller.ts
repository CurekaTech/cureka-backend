import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { AdminPincodeSearchQueryDto } from '../dto/admin-pincode-search-query.dto';
import { PincodesService } from '../services/pincodes.service';

@ApiTags('Admin Pincodes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/pincodes')
export class AdminPincodesController {
  constructor(private readonly pincodesService: PincodesService) {}

  @ApiOperation({
    summary: 'Search canonical pincodes by pincode, city, or state',
    description:
      'One row per pincode. Search matches only pincode, city, and state. City is the representative district.',
  })
  @ResponseMessage('Pincodes retrieved successfully')
  @RequirePermissions('products.read')
  @Get()
  search(@Query() query: AdminPincodeSearchQueryDto) {
    return this.pincodesService.searchAdmin(query);
  }
}
