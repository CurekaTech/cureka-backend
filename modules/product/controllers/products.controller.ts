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
      'Send JSON (application/json) or multipart/form-data. For multipart: include a "data" field with the product JSON and "images" file fields for photos. Variant photos use "variantImages_<sku>".',
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

  @ApiOperation({ summary: 'Paginated product list with filters' })
  @ResponseMessage('Products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
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
      'Send JSON (application/json) or multipart/form-data (same as create: JSON in a "data" field plus image files). Applies changes and moves the product to pending_review. Published products must be moved to draft first.',
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
