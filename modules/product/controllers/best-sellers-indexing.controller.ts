import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import {
  CurrentAdminUser,
  IAdminJwtPayload,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  ReorderBestSellerCategoriesDto,
  ReorderBestSellerProductsDto,
} from '../dto/best-sellers-indexing.dto';
import { BestSellersIndexingService } from '../services/best-sellers-indexing.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/best-sellers')
export class BestSellersIndexingController {
  constructor(private readonly bestSellersIndexingService: BestSellersIndexingService) {}

  @ResponseMessage('Best seller categories retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('best_sellers.read')
  @Get('categories')
  listCategories() {
    return this.bestSellersIndexingService.listCategories();
  }

  @ResponseMessage('Best seller category order updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('best_sellers.update')
  @Patch('categories/reorder')
  reorderCategories(
    @Body() dto: ReorderBestSellerCategoriesDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.bestSellersIndexingService.reorderCategories(dto, user.email);
  }

  @ResponseMessage('Best seller products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('best_sellers.read')
  @Get('categories/:categoryRefId/products')
  listProducts(@Param('categoryRefId', RefIdPipe) categoryRefId: string) {
    return this.bestSellersIndexingService.listProducts(categoryRefId);
  }

  @ResponseMessage('Best seller product order updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('best_sellers.update')
  @Patch('categories/:categoryRefId/products/reorder')
  reorderProducts(
    @Param('categoryRefId', RefIdPipe) categoryRefId: string,
    @Body() dto: ReorderBestSellerProductsDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.bestSellersIndexingService.reorderProducts(categoryRefId, dto, user.email);
  }
}
