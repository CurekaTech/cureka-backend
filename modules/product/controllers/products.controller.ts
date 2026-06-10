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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ProductsService } from '../services/products.service';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
  UpdateProductStatusDto,
} from '../dto/product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({ summary: 'Create product draft with variants/bundle mappings' })
  @ResponseMessage('Product draft created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productsService.createDraft(dto, user.email);
  }

  @ApiOperation({ summary: 'Paginated product list with filters' })
  @ResponseMessage('Products retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @ApiOperation({ summary: 'Get product detail by refId' })
  @ResponseMessage('Product retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.productsService.findOne(refId);
  }

  @ApiOperation({ summary: 'Update product metadata and mappings' })
  @ResponseMessage('Product updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productsService.update(refId, dto, user.email);
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
