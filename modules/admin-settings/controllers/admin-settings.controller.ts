import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import {
  UpdateSettingValueDto,
  ToggleSettingStatusDto,
  BulkUpdateSettingsDto,
  UpdateAllowGuestLoginDto,
  UpdateEnableTypesenseDto,
} from '../dto/admin-setting.dto';
import { AdminSettingsService } from '../services/admin-settings.service';

@ApiTags('Admin Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  @ApiOperation({ summary: 'Get all admin settings' })
  @ApiQuery({
    name: 'type',
    required: false,
    type: String,
    description:
      'Filter settings by type: cart_charges, payment_methods, store_configuration, or logistic_partners',
  })
  @ResponseMessage('Admin settings retrieved successfully')
  @Get()
  findAll(@Query('type') type?: string) {
    return this.adminSettingsService.findAll(type);
  }

  @ApiOperation({ summary: 'Bulk update admin settings by type' })
  @ApiQuery({
    name: 'type',
    required: true,
    type: String,
    description: 'Type: cart_charges, payment_methods, or logistic_partners',
  })
  @ResponseMessage('Admin settings updated successfully')
  @Put()
  bulkUpdate(
    @Query('type') type: string,
    @Body() dto: BulkUpdateSettingsDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.adminSettingsService.bulkUpdate(type, dto, user.email);
  }

  @ApiOperation({ summary: 'Get Allow Guest Login setting' })
  @ResponseMessage('Allow guest login setting retrieved successfully')
  @Get('allow-guest-login')
  getAllowGuestLogin() {
    return this.adminSettingsService.getAllowGuestLogin();
  }

  @ApiOperation({ summary: 'Update Allow Guest Login setting' })
  @ResponseMessage('Allow guest login setting updated successfully')
  @Put('allow-guest-login')
  updateAllowGuestLogin(
    @Body() dto: UpdateAllowGuestLoginDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.adminSettingsService.updateAllowGuestLogin(dto.enabled, user.email);
  }

  @ApiOperation({ summary: 'Get Enable Typesense setting (Store Configuration)' })
  @ResponseMessage('Enable Typesense setting retrieved successfully')
  @Get('enable-typesense')
  getEnableTypesense() {
    return this.adminSettingsService.getEnableTypesense();
  }

  @ApiOperation({ summary: 'Update Enable Typesense setting (Store Configuration)' })
  @ResponseMessage('Enable Typesense setting updated successfully')
  @Put('enable-typesense')
  updateEnableTypesense(
    @Body() dto: UpdateEnableTypesenseDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.adminSettingsService.updateEnableTypesense(dto.enabled, user.email);
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
