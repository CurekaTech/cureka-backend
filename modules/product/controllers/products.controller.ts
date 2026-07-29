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
  CreateProductDto,
  ProductQueryDto,
  UpdateProductStatusDto,
  BulkMarkOutOfStockDto,
} from '../dto/product.dto';
import { RejectProductDto } from '../dto/reject-product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Create product and submit for checker review',
    description:
      'JSON or multipart/form-data. Variant images: variants[].images + variantImages_<sku> files. Product images: media[] + images files. For variable products, use media[].type=`common` for images/videos shared across all variants (auto-merged into every variant on GET). Size chart: optional sizeChart object ({key,name}) or multipart file field "sizeChart". Expiry date: send `expiryDate` as dd-mm-yyyy — on simple products at top-level (or variants[0]); on variable products on each variants[] entry.',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ResponseMessage('Product created and submitted for review')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
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
      'Supports pagination, search, status/productType filters, brandRefId (single) or brandRefIds (multiple), and sorting via sortBy + sortOrder (ASC|DESC). sortBy: refId, name, slug, productType, status, categoryName, brandName, productNatureName, price, stock, sku, publishedAt, createdAt, updatedAt.',
  })
  @ResponseMessage('Products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @ApiOperation({
    summary: 'Bulk mark products out of stock',
    description:
      'Accepts product refIds selected from the admin product list. Sets stock = 0 on every non-deleted variant of each product. Duplicate refIds are ignored. Emits product-updated events for cache/search/Unicommerce sync. Max 500 refIds per request.',
  })
  @ResponseMessage('Products marked out of stock successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('bulk-mark-out-of-stock')
  @HttpCode(HttpStatus.OK)
  bulkMarkOutOfStock(@Body() dto: BulkMarkOutOfStockDto) {
    return this.productsService.bulkMarkOutOfStock(dto);
  }

  @ApiOperation({ summary: 'Re-submit product for checker approval (after rejection or draft edits)' })
  @ResponseMessage('Product submitted for review')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post(':refId/submit-for-review')
  submitForReview(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.submitForReview(refId, user.email);
  }

  @ApiOperation({ summary: 'Checker approve product (go live)' })
  @ResponseMessage('Product approved and published')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post(':refId/approve')
  approve(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.approve(refId, user.email);
  }

  @ApiOperation({ summary: 'Checker reject product' })
  @ResponseMessage('Product rejected')
  @Roles(AdminUserRole.SUPER_ADMIN)
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
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
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
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
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
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/publish')
  publish(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.publish(refId, user.email);
  }

  @ApiOperation({ summary: 'Update product status' })
  @ResponseMessage('Product status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
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
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productsService.remove(refId);
  }
}
