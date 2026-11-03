import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  NotFoundException,
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
  CreateDoctorDto,
  DoctorListQueryDto,
  RejectDoctorDto,
  UpdateDoctorActiveStatusDto,
  UpdateDoctorDto,
} from '../dto/admin-doctor.dto';
import { SetDoctorAvailabilityDto, GenerateDoctorSlotsDto } from '../dto/doctor-availability.dto';
import { DoctorsRepository } from '../repositories/doctors.repository';
import { DoctorSlotsService } from '../services/doctor-slots.service';
import { DoctorConsultationModuleEnabledGuard } from '../guards/doctor-consultation-module-enabled.guard';
import { DoctorsService } from '../services/doctors.service';

@ApiTags('Admin Doctors')
@UseGuards(DoctorConsultationModuleEnabledGuard, JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/doctors')
export class AdminDoctorsController {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly doctorSlotsService: DoctorSlotsService,
    private readonly doctorsRepository: DoctorsRepository,
  ) {}

  @ResponseMessage('Doctor created successfully')
  @RequirePermissions('doctors.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDoctorDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.doctorsService.create(dto, user.email);
  }

  @ResponseMessage('Doctors retrieved successfully')
  @RequirePermissions('doctors.read')
  @Get()
  findAll(@Query() query: DoctorListQueryDto) {
    return this.doctorsService.findAll(query);
  }

  @ResponseMessage('Doctor retrieved successfully')
  @RequirePermissions('doctors.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.doctorsService.findOne(refId);
  }

  @ResponseMessage('Doctor updated successfully')
  @RequirePermissions('doctors.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateDoctorDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.doctorsService.update(refId, dto, user.email);
  }

  @ResponseMessage('Doctor approved successfully')
  @RequirePermissions('doctors.approve')
  @Post(':refId/approve')
  approve(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.doctorsService.approve(refId, user.email);
  }

  @ResponseMessage('Doctor rejected successfully')
  @RequirePermissions('doctors.reject')
  @Post(':refId/reject')
  reject(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: RejectDoctorDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.doctorsService.reject(refId, dto, user.email);
  }

  @ResponseMessage('Doctor status updated successfully')
  @RequirePermissions('doctors.status')
  @Patch(':refId/status')
  setStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateDoctorActiveStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.doctorsService.setActiveStatus(refId, dto, user.email);
  }

  @ResponseMessage('Doctor availability updated successfully')
  @RequirePermissions('doctors.update')
  @Post(':refId/availability')
  @HttpCode(HttpStatus.OK)
  async setAvailability(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: SetDoctorAvailabilityDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const doctor = await this.doctorsRepository.findByRefId(refId);
    if (!doctor) throw new NotFoundException('Doctor not found');
    return this.doctorSlotsService.setAvailability(doctor.id, dto, user.email);
  }

  @ResponseMessage('Doctor slots generated successfully')
  @RequirePermissions('doctors.update')
  @Post(':refId/slots/generate')
  @HttpCode(HttpStatus.CREATED)
  async generateSlots(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: GenerateDoctorSlotsDto,
  ) {
    const doctor = await this.doctorsRepository.findByRefId(refId);
    if (!doctor) throw new NotFoundException('Doctor not found');
    return this.doctorSlotsService.generateSlotsForRange(
      doctor.id,
      dto.clinicId,
      new Date(dto.fromDate),
      new Date(dto.toDate),
    );
  }
}
