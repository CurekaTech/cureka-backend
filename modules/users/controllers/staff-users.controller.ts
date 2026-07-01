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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { getAssignableRoles, getUserTypeOptions } from '../constants/role-permissions.constants';
import { CreateStaffUserDto, StaffUserQueryDto, UpdateStaffUserDto } from '../dto/user.dto';
import { StaffUsersService } from '../services/staff-users.service';

@ApiTags('Staff Users')
@Controller('staff-users')
// Temporarily disabled so all /staff-users APIs can be checked during local bootstrap.
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
export class StaffUsersController {
  constructor(private readonly staffUsersService: StaffUsersService) {}

  @ApiOperation({ summary: 'Roles the current admin can assign when creating users' })
  @ResponseMessage('Assignable roles retrieved successfully')
  @Get('assignable-roles')
  getAssignableRoles(@CurrentAdminUser() user?: IAdminJwtPayload) {
    return getAssignableRoles(this.getActingAdmin(user).role as AdminUserRole);
  }

  @ApiOperation({ summary: 'User type options the current admin can create' })
  @ResponseMessage('User type options retrieved successfully')
  @Get('user-type-options')
  getUserTypeOptions(@CurrentAdminUser() user?: IAdminJwtPayload) {
    return getUserTypeOptions(this.getActingAdmin(user).role as AdminUserRole);
  }

  @ApiOperation({ summary: 'Create vendor or telecaller staff user' })
  @ResponseMessage('Staff user created successfully')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStaffUserDto, @CurrentAdminUser() user?: IAdminJwtPayload) {
    return this.staffUsersService.create(dto, this.getActingAdmin(user));
  }

  @ApiOperation({ summary: 'List vendor and telecaller staff users' })
  @ResponseMessage('Staff users retrieved successfully')
  @Get()
  findAll(@Query() query: StaffUserQueryDto, @CurrentAdminUser() user?: IAdminJwtPayload) {
    return this.staffUsersService.findAll(query, this.getActingAdmin(user));
  }

  @ApiOperation({ summary: 'Get staff user by refId or id' })
  @ResponseMessage('Staff user retrieved successfully')
  @Get(':refIdOrId')
  findOne(@Param('refIdOrId') refIdOrId: string, @CurrentAdminUser() user?: IAdminJwtPayload) {
    return this.staffUsersService.findOne(refIdOrId, this.getActingAdmin(user));
  }

  @ApiOperation({ summary: 'Update staff user profile or role' })
  @ResponseMessage('Staff user updated successfully')
  @Patch(':refIdOrId')
  update(
    @Param('refIdOrId') refIdOrId: string,
    @Body() dto: UpdateStaffUserDto,
    @CurrentAdminUser() user?: IAdminJwtPayload,
  ) {
    return this.staffUsersService.update(refIdOrId, dto, this.getActingAdmin(user));
  }

  @ApiOperation({ summary: 'Deactivate staff user (soft delete)' })
  @ResponseMessage('Staff user removed successfully')
  @Delete(':refIdOrId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refIdOrId') refIdOrId: string, @CurrentAdminUser() user?: IAdminJwtPayload) {
    return this.staffUsersService.remove(refIdOrId, this.getActingAdmin(user));
  }

  private getActingAdmin(user?: IAdminJwtPayload): IAdminJwtPayload {
    return user ?? {
      sub: 'local-bootstrap',
      email: 'local-bootstrap',
      role: AdminUserRole.SUPER_ADMIN,
    };
  }
}
