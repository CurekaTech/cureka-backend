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
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { PaginationQueryDto, RefIdPipe, ResponseMessage } from '@packages/common';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  UpdatePermissionStatusDto,
} from '../dto/permission.dto';
import { PermissionsService } from '../services/permissions.service';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @ResponseMessage('Permission created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @RequirePermissions('permissions.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePermissionDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.permissionsService.create(dto, user.email);
  }

  @ResponseMessage('Permissions retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('permissions.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.permissionsService.findAll(query);
  }

  @ResponseMessage('Permissions grouped by module retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('permissions.read')
  @Get('grouped/by-module')
  findGroupedByModule() {
    return this.permissionsService.findGroupedByModule();
  }

  @ResponseMessage('Permission retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('permissions.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.permissionsService.findOne(refId);
  }

  @ResponseMessage('Permission status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @RequirePermissions('permissions.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdatePermissionStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.permissionsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Permission updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @RequirePermissions('permissions.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdatePermissionDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.permissionsService.update(refId, dto, user.email);
  }

  @ResponseMessage('Permission deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @RequirePermissions('permissions.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.permissionsService.remove(refId);
  }
}
