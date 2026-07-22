import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  ProductReviewQueryDto,
  UpdateProductReviewStatusDto,
} from '../dto/product-review.dto';
import { ProductReviewsService } from '../services/product-reviews.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('product-reviews')
export class AdminProductReviewsController {
  constructor(private readonly productReviewsService: ProductReviewsService) {}

  @ResponseMessage('Product reviews retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('product_reviews.read')
  @Get()
  findAll(@Query() query: ProductReviewQueryDto) {
    return this.productReviewsService.findAll(query);
  }

  @ResponseMessage('Product review status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('product_reviews.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductReviewStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productReviewsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Product review deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('product_reviews.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productReviewsService.remove(refId);
  }
}
