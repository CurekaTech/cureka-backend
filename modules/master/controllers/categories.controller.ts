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
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { CategoriesService } from '../services/categories.service';
import {
  UpdateCategoryStatusDto,
  CategoryQueryDto,
  CategoryPlacementQueryDto,
  ReorderCategoriesDto,
} from '../dto/category.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('master/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ResponseMessage('Category created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.categoriesService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Categories retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.read')
  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll(query);
  }

  // NOTE: 'tree' must be declared before ':refId' so NestJS does not parse the
  // literal "tree" as a refId param.
  @ResponseMessage('Category tree retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.read')
  @Get('tree')
  findTree() {
    return this.categoriesService.findTree();
  }

  @ResponseMessage('Header categories retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.read')
  @Get('header')
  findHeaderCategories(@Query() query: CategoryPlacementQueryDto) {
    return this.categoriesService.findHeaderCategoriesForIndexing(query.parentCategoryRefId);
  }

  @ResponseMessage('Shop-by categories retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.read')
  @Get('shop-by')
  findShopByCategories() {
    return this.categoriesService.findShopByCategoriesForIndexing();
  }

  @ResponseMessage('Header category order updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.update')
  @Patch('reorder-header')
  reorderHeader(
    @Body() dto: ReorderCategoriesDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoriesService.reorderHeaderCategories(dto, user.email);
  }

  @ResponseMessage('Shop-by category order updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.update')
  @Patch('reorder-shop-by')
  reorderShopBy(
    @Body() dto: ReorderCategoriesDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoriesService.reorderShopByCategories(dto, user.email);
  }

  @ResponseMessage('Category retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.categoriesService.findOne(refId);
  }

  @ResponseMessage('Category status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCategoryStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoriesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Category updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoriesService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Category deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('categories.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.categoriesService.remove(refId);
  }
}
