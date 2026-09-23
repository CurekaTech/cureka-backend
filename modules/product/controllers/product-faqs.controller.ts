import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ProductFaqsService } from '../services/product-faqs.service';
import { CreateProductFaqDto, MapProductFaqDto } from '../dto/product-support.dto';

@ApiTags('Product FAQs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller()
export class ProductFaqsController {
  constructor(private readonly faqsService: ProductFaqsService) {}

  @ApiOperation({ summary: 'Create reusable product FAQ' })
  @ResponseMessage('Product FAQ created successfully')
  @RequirePermissions('products.create')
  @Post('product-faqs')
  createProductFaq(@Body() dto: CreateProductFaqDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.faqsService.createProductFaq(dto, user.email);
  }

  @ApiOperation({ summary: 'Map product FAQs to product' })
  @ResponseMessage('Product FAQs mapped successfully')
  @RequirePermissions('products.update')
  @Post('products/:productRefId/product-faqs')
  mapFaqs(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Body() dto: MapProductFaqDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.faqsService.mapFaqsToProduct(productRefId, dto.faqRefIds, user.email);
  }
}
