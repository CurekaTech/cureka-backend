import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  ReorderCategoryTopProductsDto,
  SaveCategoryTopProductsDto,
} from '../dto/category-product-indexing.dto';
import { CategoryProductIndexingService } from '../services/category-product-indexing.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/category-product-indexing')
export class CategoryProductIndexingController {
  constructor(
    private readonly categoryProductIndexingService: CategoryProductIndexingService,
  ) {}

  @ResponseMessage('Category context retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('category_product.read')
  @Get('categories/:categoryRefId')
  getCategory(@Param('categoryRefId', RefIdPipe) categoryRefId: string) {
    return this.categoryProductIndexingService.getCategoryContext(categoryRefId);
  }

  @ResponseMessage('Top products for category retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('category_product.read')
  @Get('categories/:categoryRefId/top-products')
  listTopProducts(@Param('categoryRefId', RefIdPipe) categoryRefId: string) {
    return this.categoryProductIndexingService.listTopVariants(categoryRefId);
  }

  @ResponseMessage('Top products for category saved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('category_product.update')
  @Put('categories/:categoryRefId/top-products')
  saveTopProducts(
    @Param('categoryRefId', RefIdPipe) categoryRefId: string,
    @Body() dto: SaveCategoryTopProductsDto,
  ) {
    return this.categoryProductIndexingService.saveTopVariants(categoryRefId, dto);
  }

  @ResponseMessage('Top product sequence updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('category_product.update')
  @Put('categories/:categoryRefId/top-products/sequence')
  reorderTopProducts(
    @Param('categoryRefId', RefIdPipe) categoryRefId: string,
    @Body() dto: ReorderCategoryTopProductsDto,
  ) {
    return this.categoryProductIndexingService.reorderTopVariants(categoryRefId, dto);
  }
}
