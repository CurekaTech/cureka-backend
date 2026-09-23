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
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ProductsService } from '../services/products.service';
import {
  ProductQueryDto,
  UpdateProductStatusDto,
  BulkMarkOutOfStockDto,
  BulkRestoreStockDto,
  BulkUpdateVariantOosDto,
  BulkUpdateCurekaInventoryDto,
} from '../dto/product.dto';
import { RejectProductDto } from '../dto/reject-product.dto';
import {
  CombineSimpleProductsDto,
  CombineSimpleProductsPreviewDto,
} from '../dto/combine-simple-products.dto';
import { CombineSimpleProductsService } from '../services/combine-simple-products.service';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly combineSimpleProductsService: CombineSimpleProductsService,
  ) {}

  @ApiOperation({
    summary: 'Create product and submit for checker review',
    description:
      'JSON or multipart/form-data. Variant images: variants[].images + variantImages_<sku> files. Product images: media[] + images files. For variable products, use media[].type=`common` for images/videos shared across all variants (auto-merged into every variant on GET). Size chart: optional sizeChart object ({key,name}) or multipart file field "sizeChart". Expiry date: send `expiryDate` as dd-mm-yyyy — on simple products at top-level (or variants[0]); on variable products on each variants[] entry.',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ResponseMessage('Product created and submitted for review')
  @RequirePermissions('products.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.productsService.createFromRequest(req, user.email);
    }
    return this.productsService.createFromJsonBody(req.body, user.email);
  }

  @ApiOperation({
    summary: 'Paginated product list with filters',
    description:
      'Supports pagination, search, status/productType filters, brandRefId (single) or brandRefIds (multiple), and sorting via sortBy + sortOrder (ASC|DESC). ' +
      'By default bundles are excluded (use GET /bundle-products). Pass includeBundles=true to search simple/variable/bundle together (homepage product pickers). ' +
      'sortBy: refId, name, slug, productType, status, categoryName, brandName, productNatureName, price, stock, sku, publishedAt, createdAt, updatedAt.',
  })
  @ResponseMessage('Products retrieved successfully')
  @RequirePermissions('products.read')
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @ApiOperation({
    summary: 'Preview combining simple/variable products into one variable product',
    description:
      'Returns one row per active variant (SKU, variantId, current attributes). Simple products yield one row each; two variables with 2 and 3 variants yield 5 rows. Optional attributeRefIds return master name/values so the admin UI can assign combinations. Does not mutate catalog.',
  })
  @ResponseMessage('Combine preview retrieved successfully')
  @RequirePermissions('products.update')
  @Post('combine-preview')
  @HttpCode(HttpStatus.OK)
  combinePreview(@Body() dto: CombineSimpleProductsPreviewDto) {
    return this.combineSimpleProductsService.preview(dto);
  }

  @ApiOperation({
    summary: 'Combine simple and/or variable products into one variable product',
    description:
      'Reparents every assigned variant onto targetProductRefId (productType=variable). SKU, variant UUID, and variant external_product_id are not changed. Other selected parents are soft-deleted. Admin must assign a unique combination to every active variant using one shared attribute set.',
  })
  @ResponseMessage('Products combined successfully')
  @RequirePermissions('products.update')
  @Post('combine-variants')
  @HttpCode(HttpStatus.OK)
  combineVariants(@Body() dto: CombineSimpleProductsDto) {
    return this.combineSimpleProductsService.combine(dto);
  }

  @ApiOperation({ summary: 'Bulk mark products out of stock' })
  @ResponseMessage('Products marked out of stock successfully')
  @RequirePermissions('products.update')
  @Post('bulk-mark-out-of-stock')
  @HttpCode(HttpStatus.OK)
  bulkMarkOutOfStock(@Body() dto: BulkMarkOutOfStockDto) {
    return this.productsService.bulkMarkOutOfStock(dto);
  }

  @ApiOperation({
    summary: 'Bulk update OOS flag on specific variants by SKU',
    description:
      'Sets outOfStock=true or outOfStock=false on exactly the variants identified by their SKUs. ' +
      'Use this instead of bulk-mark-out-of-stock when you want variant-level granularity ' +
      '(e.g. mark only one size out of stock while other sizes remain available). ' +
      'Pass outOfStock=false to clear the OOS flag (mark back in stock).',
  })
  @ResponseMessage('Variant OOS status updated successfully')
  @RequirePermissions('products.update')
  @Post('bulk-update-variant-oos')
  @HttpCode(HttpStatus.OK)
  bulkUpdateVariantOos(@Body() dto: BulkUpdateVariantOosDto) {
    return this.productsService.bulkUpdateVariantOos(dto);
  }

  @ApiOperation({
    summary: 'Cureka inventory feature status',
    description:
      'Returns whether the Cureka Inventory Admin feature is globally enabled ' +
      '(STOCK_INVENTORY_MANAGEMENT_ENABLED). Admin UI must hide the entire feature when enabled=false.',
  })
  @ResponseMessage('Cureka inventory status retrieved successfully')
  @RequirePermissions('products.read')
  @Get('cureka-inventory/status')
  getCurekaInventoryStatus() {
    return this.productsService.getCurekaInventoryStatus();
  }

  @ApiOperation({
    summary: 'Bulk update Cureka inventory flag on variants by SKU',
    description:
      'Sets inCurekaInventory=true|false for the given SKUs only. ' +
      'Does not change stock or outOfStock. Feature visibility is still gated by STOCK_INVENTORY_MANAGEMENT_ENABLED.',
  })
  @ResponseMessage('Cureka inventory flag updated successfully')
  @RequirePermissions('products.update')
  @Patch('bulk-update-cureka-inventory')
  @HttpCode(HttpStatus.OK)
  bulkUpdateCurekaInventory(@Body() dto: BulkUpdateCurekaInventoryDto) {
    return this.productsService.bulkUpdateCurekaInventory(dto);
  }

  @ApiOperation({
    summary: 'Bulk restore product stock',
    description:
      'Sets stock on all variants for each productRefId and clears outOfStock (reverts bulk mark-out-of-stock so products are in stock again).',
  })
  @ResponseMessage('Product stock restored successfully')
  @RequirePermissions('products.update')
  @Post('bulk-restore-stock')
  @HttpCode(HttpStatus.OK)
  bulkRestoreStock(@Body() dto: BulkRestoreStockDto) {
    return this.productsService.bulkRestoreStock(dto);
  }

  @ApiOperation({ summary: 'Re-submit product for checker approval (after rejection or draft edits)' })
  @ResponseMessage('Product submitted for review')
  @RequirePermissions('products.update')
  @Post(':refId/submit-for-review')
  submitForReview(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.submitForReview(refId, user.email);
  }

  @ApiOperation({ summary: 'Checker approve product (go live)' })
  @ResponseMessage('Product approved and published')
  @RequirePermissions('products.approve')
  @Post(':refId/approve')
  approve(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.approve(refId, user.email);
  }

  @ApiOperation({ summary: 'Checker reject product' })
  @ResponseMessage('Product rejected')
  @RequirePermissions('products.reject')
  @Post(':refId/reject')
  reject(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: RejectProductDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.reject(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Get product detail by refId' })
  @ResponseMessage('Product retrieved successfully')
  @RequirePermissions('products.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.productsService.findOne(refId);
  }

  @ApiOperation({
    summary: 'Update product metadata and mappings',
    description:
      'JSON or multipart/form-data. Product type may be changed between simple (single) and variable (variant); when converting variable → simple, send exactly one variant (without attributes) to keep. When media or variants[].images is sent, all product_media rows are replaced — include every image you want to keep. Variant images: variants[].images + variantImages_<sku>. Size chart: optional sizeChart object ({key,name}) or multipart file field "sizeChart". Expiry date: dd-mm-yyyy — simple products via top-level expiryDate or variants[0].expiryDate; variable products via each variants[].expiryDate.',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ResponseMessage('Product updated successfully')
  @RequirePermissions('products.update')
  @Patch(':refId')
  update(
    @Req() req: FastifyRequest,
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.productsService.updateFromRequest(req, refId, user.email);
    }
    return this.productsService.updateFromJsonBody(req.body, refId, user.email);
  }

  @ApiOperation({ summary: 'Publish product' })
  @ResponseMessage('Product published successfully')
  @RequirePermissions('products.status')
  @Patch(':refId/publish')
  publish(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.publish(refId, user.email);
  }

  @ApiOperation({ summary: 'Update product status' })
  @ResponseMessage('Product status updated successfully')
  @RequirePermissions('products.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.updateStatus(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Soft delete product' })
  @ResponseMessage('Product deleted successfully')
  @RequirePermissions('products.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productsService.remove(refId);
  }
}
