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
import { BlogPostQueryDto, UpdateBlogPostStatusDto } from '../dto/blog.dto';
import { BlogPostsService } from '../services/blog-posts.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('blog/posts')
export class AdminBlogPostsController {
  constructor(private readonly postsService: BlogPostsService) {}

  @ResponseMessage('Blog post created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_posts.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.postsService.createFromRequest(req, user.email);
    }
    return this.postsService.createFromJson(req.body as never, user.email);
  }

  @ResponseMessage('Blog posts retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_posts.read')
  @Get()
  findAll(@Query() query: BlogPostQueryDto) {
    return this.postsService.findAll(query);
  }

  @ResponseMessage('Blog post retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_posts.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.postsService.findOne(refId);
  }

  @ResponseMessage('Blog audit logs retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_posts.read')
  @Get(':refId/audit-logs')
  findAuditLogs(@Param('refId', RefIdPipe) refId: string) {
    return this.postsService.findAuditLogs(refId);
  }

  @ResponseMessage('Blog post updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_posts.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.postsService.updateFromRequest(refId, req, user.email);
    }
    return this.postsService.updateFromJson(refId, req.body as never, user.email);
  }

  @ResponseMessage('Blog post status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_posts.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateBlogPostStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.postsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Blog post deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_posts.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.postsService.remove(refId, user.email);
  }
}
