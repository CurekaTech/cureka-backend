import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  CancelConsultationDto,
  ConsultationListQueryDto,
  ConsultationReportQueryDto,
  RescheduleConsultationDto,
} from '../dto/consultation.dto';
import { UpsertFollowUpPolicyDto } from '../dto/follow-up-policy.dto';
import { DoctorConsultationModuleEnabledGuard } from '@modules/doctor/guards/doctor-consultation-module-enabled.guard';
import { ConsultationReportsService } from '../services/consultation-reports.service';
import { ConsultationsService } from '../services/consultations.service';
import { FollowUpPolicyService } from '../services/follow-up-policy.service';

@ApiTags('Admin Consultations')
@UseGuards(DoctorConsultationModuleEnabledGuard, JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/consultations')
export class AdminConsultationsController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly followUpPolicyService: FollowUpPolicyService,
    private readonly consultationReportsService: ConsultationReportsService,
  ) {}

  @ResponseMessage('Consultations retrieved successfully')
  @RequirePermissions('consultations.read')
  @Get()
  list(@Query() query: ConsultationListQueryDto, @CurrentAdminUser() _user: IAdminJwtPayload) {
    return this.consultationsService.listAdmin(query);
  }

  @ResponseMessage('Consultation report summary retrieved successfully')
  @RequirePermissions('consultations.read')
  @Get('reports/summary')
  reportSummary(@Query() query: ConsultationReportQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return this.consultationReportsService.summary(from, to);
  }

  @ResponseMessage('Follow-up policy retrieved successfully')
  @RequirePermissions('consultations.read')
  @Get('follow-up-policy')
  getFollowUpPolicy(@Query('doctorId') doctorId?: string) {
    return this.followUpPolicyService.getPolicyForAdmin(doctorId);
  }

  @ResponseMessage('Follow-up policy updated successfully')
  @RequirePermissions('consultations.update')
  @Put('follow-up-policy')
  upsertFollowUpPolicy(
    @Query('doctorId') doctorId: string | undefined,
    @Body() dto: UpsertFollowUpPolicyDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    if (doctorId) {
      return this.followUpPolicyService.upsertDoctorPolicy(doctorId, dto, user.email);
    }
    return this.followUpPolicyService.upsertGlobalPolicy(dto, user.email);
  }

  @ResponseMessage('Consultation retrieved successfully')
  @RequirePermissions('consultations.read')
  @Get(':refId')
  getOne(@Param('refId', RefIdPipe) refId: string) {
    return this.consultationsService.getByRefId(refId);
  }

  @ResponseMessage('Consultation cancelled successfully')
  @RequirePermissions('consultations.update')
  @Post(':refId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
    @Body() dto: CancelConsultationDto,
  ) {
    return this.consultationsService.cancelByAdmin(refId, user.sub, dto);
  }

  @ResponseMessage('Consultation rescheduled successfully')
  @RequirePermissions('consultations.update')
  @Post(':refId/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
    @Body() dto: RescheduleConsultationDto,
  ) {
    return this.consultationsService.reschedule(refId, { type: 'ADMIN', id: user.sub }, dto);
  }
}
