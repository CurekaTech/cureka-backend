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
  CreateSupportCategoryDto,
  SupportCategoryQueryDto,
  UpdateSupportCategoryDto,
  UpdateSupportCategoryStatusDto,
} from '../dto/support.dto';
import { SupportCategoriesService } from '../services/support-categories.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('support/categories')
export class AdminSupportCategoriesController {
  constructor(private readonly categoriesService: SupportCategoriesService) {}

  @ResponseMessage('Support category created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_categories.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSupportCategoryDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.categoriesService.create(dto, user.email);
  }

  @ResponseMessage('Support categories retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_categories.read')
  @Get()
  findAll(@Query() query: SupportCategoryQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @ResponseMessage('Support category retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_categories.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.categoriesService.findOne(refId);
  }

  @ResponseMessage('Support category updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_categories.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSupportCategoryDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoriesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Support category status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_categories.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSupportCategoryStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoriesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Support category deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_categories.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.categoriesService.remove(refId);
  }
}
