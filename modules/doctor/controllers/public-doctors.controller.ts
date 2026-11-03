import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { DoctorCategory } from '../enums/doctor-category.enum';
import { DoctorStatus } from '../enums/doctor-status.enum';
import { DoctorConsultationModuleEnabledGuard } from '../guards/doctor-consultation-module-enabled.guard';
import { DoctorsService } from '../services/doctors.service';
import { DoctorSlotsService } from '../services/doctor-slots.service';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@packages/common';

class PublicDoctorListQueryDto extends PaginationQueryDto {
  @IsOptional()
  search?: string;

  @IsOptional()
  @IsEnum(DoctorCategory)
  category?: DoctorCategory;
}

class PublicDoctorSlotsQueryDto {
  @IsUUID()
  clinicId!: string;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}

@ApiTags('Public Doctors')
@UseGuards(DoctorConsultationModuleEnabledGuard)
@Controller('public/doctors')
export class PublicDoctorsController {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly doctorSlotsService: DoctorSlotsService,
  ) {}

  @ResponseMessage('Doctors retrieved successfully')
  @Get()
  list(@Query() query: PublicDoctorListQueryDto) {
    return this.doctorsService.findAll({
      ...query,
      isBookable: true,
      isActive: true,
      status: DoctorStatus.APPROVED,
    });
  }

  @ResponseMessage('Doctor profile retrieved successfully')
  @Get(':slug')
  profile(@Param('slug') slug: string) {
    return this.doctorsService.findPublicProfile(slug);
  }

  @ResponseMessage('Doctor slots retrieved successfully')
  @Get(':slug/slots')
  slots(@Param('slug') slug: string, @Query() query: PublicDoctorSlotsQueryDto) {
    return this.doctorsService.findPublicProfile(slug).then(async (doctor) => {
      const slots = await this.doctorSlotsService.listOpenSlots(
        doctor.id,
        query.clinicId,
        new Date(query.from),
        new Date(query.to),
      );
      return slots;
    });
  }
}
