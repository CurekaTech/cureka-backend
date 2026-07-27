import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { BlogCommentQueryDto, UpdateBlogCommentStatusDto } from '../dto/blog.dto';
import { BlogCommentsService } from '../services/blog-comments.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('blog/comments')
export class AdminBlogCommentsController {
  constructor(private readonly commentsService: BlogCommentsService) {}

  @ResponseMessage('Blog comments retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_comments.read')
  @Get()
  findAll(@Query() query: BlogCommentQueryDto) {
    return this.commentsService.findAll(query);
  }

  @ResponseMessage('Blog comment status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_comments.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateBlogCommentStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.commentsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Blog comment deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('blog_comments.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.commentsService.remove(refId);
  }
}
