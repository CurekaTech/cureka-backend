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
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { MasterListQueryDto } from '@modules/master/dto/master-list-query.dto';
import { CreateRoleDto, UpdateRoleDto, UpdateRoleStatusDto } from '../dto/role.dto';
import { RolesService } from '../services/roles.service';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ResponseMessage('Role created successfully')
  @RequirePermissions('roles.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRoleDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.rolesService.create(dto, user.email);
  }

  @ResponseMessage('Roles retrieved successfully')
  @RequirePermissions('roles.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.rolesService.findAll(query);
  }

  @ResponseMessage('Role retrieved successfully')
  @RequirePermissions('roles.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.rolesService.findOne(refId);
  }

  @ResponseMessage('Role status updated successfully')
  @RequirePermissions('roles.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateRoleStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.rolesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Role updated successfully')
  @RequirePermissions('roles.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.rolesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Role deleted successfully')
  @RequirePermissions('roles.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.rolesService.remove(refId);
  }
}
