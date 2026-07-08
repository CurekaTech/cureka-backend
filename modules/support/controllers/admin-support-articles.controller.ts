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
  SupportArticleQueryDto,
  UpdateSupportArticleStatusDto,
} from '../dto/support.dto';
import { SupportArticlesService } from '../services/support-articles.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('support/articles')
export class AdminSupportArticlesController {
  constructor(private readonly articlesService: SupportArticlesService) {}

  @ResponseMessage('Support article created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_articles.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.articlesService.createFromRequest(req, user.email);
    }
    return this.articlesService.createFromJson(req.body as never, user.email);
  }

  @ResponseMessage('Support articles retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_articles.read')
  @Get()
  findAll(@Query() query: SupportArticleQueryDto) {
    return this.articlesService.findAll(query);
  }

  @ResponseMessage('Support article retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_articles.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.articlesService.findOne(refId);
  }

  @ResponseMessage('Support article updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_articles.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.articlesService.updateFromRequest(refId, req, user.email);
    }
    return this.articlesService.updateFromJson(refId, req.body as never, user.email);
  }

  @ResponseMessage('Support article status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_articles.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSupportArticleStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.articlesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Support article deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_articles.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.articlesService.remove(refId);
  }
}
