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

import { RefIdPipe } from '@packages/common';
import { AdminUsersService } from '../services/admin-users.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from '../dto/admin-user.dto';
import { PaginationQueryDto } from '@packages/common';
import { JwtAuthGuard } from '@packages/auth';
import { RolesGuard } from '@packages/auth';
import { Roles } from '@packages/auth';
import { AdminUserRole } from '../enums/admin-user-role.enum';
import { CurrentAdminUser } from '@packages/auth';
import { IAdminJwtPayload } from '@packages/auth';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @RequirePermissions('admin_users.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAdminUserDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.adminUsersService.create(
      dto,
      user.email,
      user.role as AdminUserRole,
    );
  }

  @RequirePermissions('admin_users.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.adminUsersService.findAll(query);
  }

  @RequirePermissions('admin_users.read')
  @Get(':refIdOrId')
  findOne(@Param('refIdOrId') refIdOrId: string) {
    return this.adminUsersService.findOne(refIdOrId);
  }

  @RequirePermissions('admin_users.update')
  @Patch(':refIdOrId')
  update(
    @Param('refIdOrId') refIdOrId: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.adminUsersService.update(refIdOrId, dto, user.role as AdminUserRole);
  }

  @RequirePermissions('admin_users.delete')
  @Delete(':refIdOrId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refIdOrId') refIdOrId: string) {
    return this.adminUsersService.remove(refIdOrId);
  }
}
