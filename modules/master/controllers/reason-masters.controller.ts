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
import { ReasonMastersService } from '../services/reason-masters.service';
import {
  CreateReasonMasterDto,
  ReasonMasterQueryDto,
  UpdateReasonMasterDto,
  UpdateReasonMasterStatusDto,
} from '../dto/reason-master.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/reason-masters')
export class ReasonMastersController {
  constructor(private readonly reasonMastersService: ReasonMastersService) {}

  @ResponseMessage('Reason created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateReasonMasterDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.reasonMastersService.create(dto, user.email);
  }

  @ResponseMessage('Reasons retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: ReasonMasterQueryDto) {
    return this.reasonMastersService.findAll(query);
  }

  @ResponseMessage('Reason retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.reasonMastersService.findOne(refId);
  }

  @ResponseMessage('Reason status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateReasonMasterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.reasonMastersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Reason updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateReasonMasterDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.reasonMastersService.update(refId, dto, user.email);
  }

  @ResponseMessage('Reason deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.reasonMastersService.remove(refId);
  }
}
