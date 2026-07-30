import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ProductsService } from '../services/products.service';
import {
  BulkMarkOutOfStockDto,
  BulkRestoreStockDto,
  ProductQueryDto,
  UpdateProductStatusDto,
} from '../dto/product.dto';
import { RejectProductDto } from '../dto/reject-product.dto';
import { ProductStatus } from '../enums/product-status.enum';

/**
 * Bundle product APIs — same behaviour as Products, scoped to productType=bundle.
 * Pricing/inventory use a single internal pricing variant (mrp/sellingPrice/stock).
 */
@ApiTags('Bundle Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bundle-products')
export class BundleProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Create bundle product and submit for review',
    description:
      'productType is forced to `bundle`. Provide bundleItems (≥1) and pricing via top-level mrp/sellingPrice/stock/sku (or a single variants[] entry). Same as products: description, healthConcernRefIds, wellnessGoalRefIds, manufacturer/packer/countryOfOrigin/components, commerce flags (subscriptionEnabled, codAvailable, emiAvailable, returnAllowed/returnWindowDays/returnPolicy, replaceAllowed/replaceWindowDays), expiryDate/expiresIn/expiresInMonths, media, SEO. Optional curatedBy / curatedFor. Categories via categories[]. SKU auto-generated as CAT/BRA/NNN if omitted (e.g. SUP/NES/001).',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ResponseMessage('Bundle product created and submitted for review')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.productsService.createBundleFromRequest(req, user.email);
    }
    return this.productsService.createBundleFromJsonBody(req.body, user.email);
  }

  @ApiOperation({
    summary: 'Paginated bundle products list',
    description:
      'Same filters as products, scoped to productType=bundle. Pass status to filter (draft, pending_review, published, rejected). Omit status to return all.',
  })
  @ResponseMessage('Bundle products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findBundles(query);
  }

  @ApiOperation({ summary: 'Rejected bundle products list' })
  @ResponseMessage('Rejected bundle products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('rejected')
  findRejected(@Query() query: ProductQueryDto) {
    return this.productsService.findBundles(query, ProductStatus.REJECTED);
  }

  @ApiOperation({ summary: 'Pending review bundle products list' })
  @ResponseMessage('Pending bundle products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('pending')
  findPending(@Query() query: ProductQueryDto) {
    return this.productsService.findBundles(query, ProductStatus.PENDING_REVIEW);
  }

  @ApiOperation({ summary: 'Draft bundle products list' })
  @ResponseMessage('Draft bundle products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('drafts')
  findDrafts(@Query() query: ProductQueryDto) {
    return this.productsService.findBundles(query, ProductStatus.DRAFT);
  }

  @ApiOperation({
    summary: 'Bulk mark bundle products out of stock',
    description: 'Sets stock = 0 on the pricing variant of each selected bundle.',
  })
  @ResponseMessage('Bundle products marked out of stock successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('bulk-mark-out-of-stock')
  @HttpCode(HttpStatus.OK)
  bulkMarkOutOfStock(@Body() dto: BulkMarkOutOfStockDto) {
    return this.productsService.bulkMarkOutOfStock(dto);
  }

  @ApiOperation({
    summary: 'Bulk restore stock for bundle products',
    description: 'Sets stock on the pricing variant for each selected bundle.',
  })
  @ResponseMessage('Bundle product stock restored successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('bulk-restore-stock')
  @HttpCode(HttpStatus.OK)
  bulkRestoreStock(@Body() dto: BulkRestoreStockDto) {
    return this.productsService.bulkRestoreStock(dto);
  }

  @ApiOperation({ summary: 'Submit bundle for checker review' })
  @ResponseMessage('Bundle product submitted for review')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post(':refId/submit-for-review')
  submitForReview(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.submitForReview(refId, user.email);
  }

  @ApiOperation({ summary: 'Approve bundle product (publish)' })
  @ResponseMessage('Bundle product approved and published')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post(':refId/approve')
  approve(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.approve(refId, user.email);
  }

  @ApiOperation({
    summary: 'Reject bundle product',
    description:
      'Body: `{ "reason": "..." }` (alias `rejectionReason` also accepted). Reason is stored and returned as `rejectionReason` on detail/list.',
  })
  @ResponseMessage('Bundle product rejected')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post(':refId/reject')
  reject(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: RejectProductDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.reject(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Publish bundle product' })
  @ResponseMessage('Bundle product published successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/publish')
  publish(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.publish(refId, user.email);
  }

  @ApiOperation({ summary: 'Unpublish bundle product (set inactive)' })
  @ResponseMessage('Bundle product unpublished successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/unpublish')
  unpublish(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.unpublish(refId, user.email);
  }

  @ApiOperation({ summary: 'Update bundle product status' })
  @ResponseMessage('Bundle product status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.updateStatus(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Restore soft-deleted bundle product' })
  @ResponseMessage('Bundle product restored successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post(':refId/restore')
  restore(@Param('refId', RefIdPipe) refId: string) {
    return this.productsService.restore(refId);
  }

  @ApiOperation({ summary: 'Get bundle product detail by refId' })
  @ResponseMessage('Bundle product retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.productsService.findBundleOne(refId);
  }

  @ApiOperation({
    summary: 'Update bundle product',
    description:
      'Send bundleItems to replace linked products. Send mrp/sellingPrice/stock (or variants[0]) to update pricing/inventory. Commerce flags, manufacturer/packer/country/components, curatedBy/curatedFor, and categories[] work the same as products.',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ResponseMessage('Bundle product updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Req() req: FastifyRequest,
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.productsService.updateBundleFromRequest(req, refId, user.email);
    }
    return this.productsService.updateBundleFromJsonBody(req.body, refId, user.email);
  }

  @ApiOperation({ summary: 'Soft delete bundle product' })
  @ResponseMessage('Bundle product deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productsService.remove(refId);
  }
}
