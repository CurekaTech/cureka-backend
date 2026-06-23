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
import { ProductTagsService } from '../services/product-tags.service';
import {
  CreateProductTagDto,
  UpdateProductTagDto,
  UpdateProductTagStatusDto,
} from '../dto/product-tag.dto';

@ApiTags('Product Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('product-tags')
export class ProductTagsController {
  constructor(private readonly productTagsService: ProductTagsService) {}

  @ApiOperation({ summary: 'Create product tag' })
  @ResponseMessage('Product tag created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductTagDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productTagsService.create(dto, user.email);
  }

  @ApiOperation({ summary: 'List product tags' })
  @ResponseMessage('Product tags retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.productTagsService.findAll(query);
  }

  @ApiOperation({ summary: 'Get product tag by refId' })
  @ResponseMessage('Product tag retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.productTagsService.findOne(refId);
  }

  @ApiOperation({ summary: 'Update product tag status' })
  @ResponseMessage('Product tag status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
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
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
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
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productTagsService.remove(refId);
  }
}
