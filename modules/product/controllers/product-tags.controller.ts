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
import { RefIdPipe, PaginationQueryDto, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ProductTagsService } from '../services/product-tags.service';
import {
  CreateProductTagDto,
  UpdateProductTagDto,
  UpdateProductTagStatusDto,
} from '../dto/product-tag.dto';

@ApiTags('Product Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('product-tags')
export class ProductTagsController {
  constructor(private readonly productTagsService: ProductTagsService) {}

  @ApiOperation({ summary: 'Create product tag' })
  @ResponseMessage('Product tag created successfully')
  @RequirePermissions('product_tags.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductTagDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productTagsService.create(dto, user.email);
  }

  @ApiOperation({ summary: 'List product tags' })
  @ResponseMessage('Product tags retrieved successfully')
  @RequirePermissions('product_tags.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.productTagsService.findAll(query);
  }

  @ApiOperation({ summary: 'Get product tag by refId' })
  @ResponseMessage('Product tag retrieved successfully')
  @RequirePermissions('product_tags.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.productTagsService.findOne(refId);
  }

  @ApiOperation({ summary: 'Update product tag status' })
  @ResponseMessage('Product tag status updated successfully')
  @RequirePermissions('product_tags.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductTagStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productTagsService.updateStatus(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Update product tag' })
  @ResponseMessage('Product tag updated successfully')
  @RequirePermissions('product_tags.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductTagDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productTagsService.update(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Delete product tag' })
  @ResponseMessage('Product tag deleted successfully')
  @RequirePermissions('product_tags.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productTagsService.remove(refId);
  }
}
