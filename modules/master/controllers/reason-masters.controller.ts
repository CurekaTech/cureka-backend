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
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ReasonMastersService } from '../services/reason-masters.service';
import {
  CreateReasonMasterDto,
  ReasonMasterQueryDto,
  UpdateReasonMasterDto,
  UpdateReasonMasterStatusDto,
} from '../dto/reason-master.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/reason-masters')
export class ReasonMastersController {
  constructor(private readonly reasonMastersService: ReasonMastersService) {}

  @ResponseMessage('Reason created successfully')
  @RequirePermissions('reason_masters.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateReasonMasterDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.reasonMastersService.create(dto, user.email);
  }

  @ResponseMessage('Reasons retrieved successfully')
  @RequirePermissions('reason_masters.read')
  @Get()
  findAll(@Query() query: ReasonMasterQueryDto) {
    return this.reasonMastersService.findAll(query);
  }

  @ResponseMessage('Reason retrieved successfully')
  @RequirePermissions('reason_masters.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.reasonMastersService.findOne(refId);
  }

  @ResponseMessage('Reason status updated successfully')
  @RequirePermissions('reason_masters.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateReasonMasterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.reasonMastersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Reason updated successfully')
  @RequirePermissions('reason_masters.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateReasonMasterDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.reasonMastersService.update(refId, dto, user.email);
  }

  @ResponseMessage('Reason deleted successfully')
  @RequirePermissions('reason_masters.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.reasonMastersService.remove(refId);
  }
}
