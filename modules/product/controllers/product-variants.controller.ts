import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ProductVariantsService } from '../services/product-variants.service';
import { CreateVariantDto } from '../dto/variant.dto';
import {
  ReplaceVariantPincodesDto,
  UpdateVariantPincodeManagementDto,
} from '@modules/pincodes/dto/variant-pincode.dto';

@ApiTags('Product Variants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('products/:productRefId/variants')
export class ProductVariantsController {
  constructor(private readonly variantsService: ProductVariantsService) {}

  @ApiOperation({ summary: 'Bulk add variants to existing product' })
  @ResponseMessage('Variants added successfully')
  @RequirePermissions('products.update')
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
  @RequirePermissions('products.delete')
  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Param('variantId') variantId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.variantsService.removeVariant(productRefId, variantId, user.email);
  }

  @ApiOperation({ summary: 'Get pincode availability for a product variant' })
  @ResponseMessage('Variant pincode availability retrieved successfully')
  @RequirePermissions('products.read')
  @Get(':variantId/pincodes')
  getPincodes(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.variantsService.getPincodeAvailability(productRefId, variantId);
  }

  @ApiOperation({ summary: 'Enable or disable pincode management for a variant' })
  @ResponseMessage('Variant pincode management updated successfully')
  @RequirePermissions('products.update')
  @Patch(':variantId/pincode-management')
  updatePincodeManagement(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantPincodeManagementDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.variantsService.updatePincodeManagement(
      productRefId,
      variantId,
      dto.isPincodeManaged,
      user.email,
    );
  }

  @ApiOperation({ summary: 'Replace the pincodes where a managed variant is available' })
  @ResponseMessage('Variant pincodes updated successfully')
  @RequirePermissions('products.update')
  @Put(':variantId/pincodes')
  replacePincodes(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Param('variantId') variantId: string,
    @Body() dto: ReplaceVariantPincodesDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.variantsService.replacePincodes(productRefId, variantId, dto.pincodes, user.email);
  }
}
