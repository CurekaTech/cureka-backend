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

  @ApiOperation({ summary: 'Get all master data for the Add Product wizard' })
  @ResponseMessage('Product wizard bootstrap data retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('bootstrap')
  getBootstrap(@Query() query: ProductWizardBootstrapQueryDto) {
    return this.productWizardBootstrapService.getBootstrap(query);
  }
}
