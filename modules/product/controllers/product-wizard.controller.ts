import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ProductWizardBootstrapQueryDto } from '../dto/product-wizard-bootstrap-query.dto';
import { ProductWizardBootstrapService } from '../services/product-wizard-bootstrap.service';

@ApiTags('Product Wizard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/product-wizard')
export class ProductWizardController {
  constructor(private readonly productWizardBootstrapService: ProductWizardBootstrapService) {}

  @ApiOperation({
    summary: 'Get paginated master data for the Add Product wizard by type',
    description:
      'Pass `type` (brand, category, wellness-goal, etc.) with optional search, sortBy, sortOrder, limit, and cursor for cursor-based pagination.',
  })
  @ResponseMessage('Product wizard master data retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('bootstrap')
  getBootstrap(@Query() query: ProductWizardBootstrapQueryDto) {
    return this.productWizardBootstrapService.getBootstrap(query);
  }
}
