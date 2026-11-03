import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { CurrentDoctor } from '@modules/doctor/decorators/current-doctor.decorator';
import { DoctorAccessGuard } from '@modules/doctor/guards/doctor-access.guard';
import { DoctorConsultationModuleEnabledGuard } from '@modules/doctor/guards/doctor-consultation-module-enabled.guard';
import { DoctorJwtAuthGuard } from '@modules/doctor/guards/doctor-jwt-auth.guard';
import { IDoctorJwtPayload } from '@modules/doctor/interfaces/doctor-jwt-payload.interface';
import {
  CancelConsultationDto,
  CompleteConsultationDto,
  ConsultationListQueryDto,
  RecommendFollowUpDto,
  RescheduleConsultationDto,
  UpdateConsultationAttendanceDto,
  UpsertPrescriptionDto,
} from '../dto/consultation.dto';
import { ConsultationsService } from '../services/consultations.service';

@ApiTags('Doctor Consultations')
@UseGuards(DoctorConsultationModuleEnabledGuard, DoctorJwtAuthGuard, DoctorAccessGuard)
@Controller('doctor/consultations')
export class DoctorConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @ResponseMessage('Consultations retrieved successfully')
  @Get()
  list(@CurrentDoctor() doctor: IDoctorJwtPayload, @Query() query: ConsultationListQueryDto) {
    return this.consultationsService.listForDoctor(doctor.sub, query);
  }

  @ResponseMessage('Consultation retrieved successfully')
  @Get(':refId')
  getOne(@Param('refId', RefIdPipe) refId: string) {
    return this.consultationsService.getByRefId(refId);
  }

  @ResponseMessage('Consultation completed successfully')
  @Post(':refId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: CompleteConsultationDto,
  ) {
    return this.consultationsService.complete(refId, doctor.sub, dto);
  }

  @ResponseMessage('Consultation cancelled successfully')
  @Post(':refId/cancel')
  cancel(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: CancelConsultationDto,
  ) {
    return this.consultationsService.cancelByDoctor(refId, doctor.sub, dto);
  }

  @ResponseMessage('Follow-up recommended successfully')
  @Post(':refId/follow-up/recommend')
  @HttpCode(HttpStatus.CREATED)
  recommendFollowUp(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: RecommendFollowUpDto,
  ) {
    return this.consultationsService.recommendFollowUp(refId, doctor.sub, dto);
  }

  @ResponseMessage('Consultation rescheduled successfully')
  @Post(':refId/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: RescheduleConsultationDto,
  ) {
    return this.consultationsService.reschedule(refId, { type: 'DOCTOR', id: doctor.sub }, dto);
  }

  @ResponseMessage('Attendance updated successfully')
  @Patch(':refId/attendance')
  updateAttendance(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: UpdateConsultationAttendanceDto,
  ) {
    return this.consultationsService.updateAttendance(refId, doctor.sub, dto);
  }

  @ResponseMessage('Prescription saved successfully')
  @Put(':refId/prescription')
  upsertPrescription(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: UpsertPrescriptionDto,
  ) {
    return this.consultationsService.upsertPrescription(refId, doctor.sub, dto);
  }

  @ResponseMessage('Consultation documents retrieved successfully')
  @Get(':refId/documents')
  listDocuments(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentDoctor() doctor: IDoctorJwtPayload,
  ) {
    return this.consultationsService.listDocuments(refId, doctor.sub);
  }
}
