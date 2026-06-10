import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ProductVariantsService } from '../services/product-variants.service';
import { CreateVariantDto } from '../dto/variant.dto';

@ApiTags('Product Variants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products/:productRefId/variants')
export class ProductVariantsController {
  constructor(private readonly variantsService: ProductVariantsService) {}

  @ApiOperation({ summary: 'Bulk add variants to existing product' })
  @ResponseMessage('Variants added successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  addVariants(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Body() variants: CreateVariantDto[],
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.variantsService.addVariants(productRefId, variants, user.email);
  }

  @ApiOperation({ summary: 'Soft delete variant' })
  @ResponseMessage('Variant deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Param('variantId') variantId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.variantsService.removeVariant(productRefId, variantId, user.email);
  }
}
