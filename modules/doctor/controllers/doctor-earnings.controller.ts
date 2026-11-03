import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { CurrentDoctor } from '../decorators/current-doctor.decorator';
import { DoctorAccessGuard } from '../guards/doctor-access.guard';
import { DoctorConsultationModuleEnabledGuard } from '../guards/doctor-consultation-module-enabled.guard';
import { DoctorJwtAuthGuard } from '../guards/doctor-jwt-auth.guard';
import { IDoctorJwtPayload } from '../interfaces/doctor-jwt-payload.interface';
import { DoctorEarningsQueryDto } from '../dto/doctor-earnings.dto';
import { DoctorEarningsService } from '../services/doctor-earnings.service';

@ApiTags('Doctor Earnings')
@UseGuards(DoctorConsultationModuleEnabledGuard, DoctorJwtAuthGuard, DoctorAccessGuard)
@Controller('doctor/earnings')
export class DoctorEarningsController {
  constructor(private readonly doctorEarningsService: DoctorEarningsService) {}

  @ResponseMessage('Earnings summary retrieved successfully')
  @Get('summary')
  summary(@CurrentDoctor() doctor: IDoctorJwtPayload, @Query() query: DoctorEarningsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return this.doctorEarningsService.summary(doctor.sub, from, to);
  }
}
