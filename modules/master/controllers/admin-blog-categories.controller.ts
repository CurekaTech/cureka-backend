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
import {
  BlogCategoryQueryDto,
  UpdateBlogCategoryStatusDto,
} from '../dto/blog.dto';
import { BlogCategoriesService } from '../services/blog-categories.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('blog/categories')
export class AdminBlogCategoriesController {
  constructor(private readonly categoriesService: BlogCategoriesService) {}

  @ResponseMessage('Blog category created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_categories.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.categoriesService.createFromRequest(req, user.email);
    }
    return this.categoriesService.create(req.body as never, user.email);
  }

  @ResponseMessage('Blog categories retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_categories.read')
  @Get()
  findAll(@Query() query: BlogCategoryQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @ResponseMessage('Blog category retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_categories.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.categoriesService.findOne(refId);
  }

  @ResponseMessage('Blog category updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_categories.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.categoriesService.updateFromRequest(refId, req, user.email);
    }
    return this.categoriesService.update(refId, req.body as never, user.email);
  }

  @ResponseMessage('Blog category status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_categories.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateBlogCategoryStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoriesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Blog category deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_categories.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.categoriesService.remove(refId);
  }
}
