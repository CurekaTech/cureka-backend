import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { RETURN_PERMISSIONS } from '../constants/return-permissions.constants';
import { UpdateReturnPolicyDto } from '../dto/return-request.dto';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnActor } from '../interfaces/return-request.interface';
import { ReturnPolicyService } from '../services/return-policy.service';

@ApiTags('Admin Return Policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/return-policies')
export class AdminReturnPoliciesController {
  constructor(private readonly returnPolicyService: ReturnPolicyService) {}

  @ApiOperation({
    summary: 'Get the return policy of a product and its SKUs',
    description: 'Null variant values mean the SKU inherits the product-level setting.',
  })
  @ResponseMessage('Return policy retrieved successfully')
  @RequirePermissions(RETURN_PERMISSIONS.POLICY_READ)
  @Get('products/:productId')
  getProductPolicy(@Param('productId') productId: string) {
    return this.returnPolicyService.getProductPolicy(productId);
  }

  @ApiOperation({
    summary: 'Update the product-level return policy',
    description: 'Applies to future orders only; existing orders keep their captured snapshot.',
  })
  @ResponseMessage('Return policy updated successfully')
  @RequirePermissions(RETURN_PERMISSIONS.POLICY_UPDATE)
  @Patch('products/:productId')
  updateProductPolicy(
    @Param('productId') productId: string,
    @Body() dto: UpdateReturnPolicyDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.returnPolicyService.updateProductPolicy(productId, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Override the return policy for a single SKU' })
  @ResponseMessage('Return policy updated successfully')
  @RequirePermissions(RETURN_PERMISSIONS.POLICY_UPDATE)
  @Patch('variants/:variantId')
  updateVariantPolicy(
    @Param('variantId') variantId: string,
    @Body() dto: UpdateReturnPolicyDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.returnPolicyService.updateVariantPolicy(variantId, dto, this.toActor(user));
  }

  private toActor(user: IAdminJwtPayload): ReturnActor {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
      type: ReturnRequestedByType.ADMIN,
    };
  }
}
