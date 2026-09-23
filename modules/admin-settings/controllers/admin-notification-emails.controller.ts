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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  AdminNotificationEmailQueryDto,
  CreateAdminNotificationEmailDto,
  UpdateAdminNotificationEmailDto,
} from '../dto/admin-notification-email.dto';
import { AdminNotificationEmailsService } from '../services/admin-notification-emails.service';

@ApiTags('Admin Notification Emails')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/settings/notification-emails')
export class AdminNotificationEmailsController {
  constructor(private readonly service: AdminNotificationEmailsService) {}

  @ApiOperation({ summary: 'List notification email recipients' })
  @ResponseMessage('Notification emails retrieved successfully')
  @RequirePermissions('settings.read')
  @Get()
  findAll(@Query() query: AdminNotificationEmailQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Create a notification email recipient' })
  @ResponseMessage('Notification email created successfully')
  @RequirePermissions('settings.update')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAdminNotificationEmailDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.service.create(dto, user.email);
  }

  @ApiOperation({ summary: 'Get a notification email recipient' })
  @ResponseMessage('Notification email retrieved successfully')
  @RequirePermissions('settings.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.service.findOne(refId);
  }

  @ApiOperation({ summary: 'Update a notification email recipient' })
  @ResponseMessage('Notification email updated successfully')
  @RequirePermissions('settings.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateAdminNotificationEmailDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.service.update(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Delete a notification email recipient' })
  @ResponseMessage('Notification email deleted successfully')
  @RequirePermissions('settings.update')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.service.remove(refId);
  }
}
