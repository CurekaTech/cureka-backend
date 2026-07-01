import { Body, Controller, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { UpdateSettingValueDto, ToggleSettingStatusDto } from '../dto/admin-setting.dto';
import { AdminSettingsService } from '../services/admin-settings.service';

@ApiTags('Admin Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  @ApiOperation({ summary: 'Get all admin settings' })
  @ResponseMessage('Admin settings retrieved successfully')
  @Get()
  findAll() {
    return this.adminSettingsService.findAll();
  }

  @ApiOperation({ summary: 'Update admin setting value' })
  @ResponseMessage('Admin setting value updated successfully')
  @Put(':key/value')
  updateValue(
    @Param('key') key: string,
    @Body() dto: UpdateSettingValueDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.adminSettingsService.updateValue(key, dto, user.email);
  }

  @ApiOperation({ summary: 'Toggle admin setting status' })
  @ResponseMessage('Admin setting status toggled successfully')
  @Patch(':key/status')
  toggleStatus(
    @Param('key') key: string,
    @Body() dto: ToggleSettingStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.adminSettingsService.toggleStatus(key, dto, user.email);
  }
}
