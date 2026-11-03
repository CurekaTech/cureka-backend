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
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  CreateLanguageDto,
  CreateQualificationDto,
  CreateSpecializationDto,
  DoctorMasterListQueryDto,
  UpdateDoctorMasterStatusDto,
  UpdateLanguageDto,
  UpdateQualificationDto,
  UpdateSpecializationDto,
} from '../dto/doctor-master.dto';
import { DoctorConsultationModuleEnabledGuard } from '../guards/doctor-consultation-module-enabled.guard';
import { DoctorMastersService } from '../services/doctor-masters.service';

@UseGuards(DoctorConsultationModuleEnabledGuard, JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/doctor-masters')
export class AdminDoctorMastersController {
  constructor(private readonly mastersService: DoctorMastersService) {}

  // Specializations
  @ResponseMessage('Specialization created successfully')
  @RequirePermissions('doctor_specializations.create')
  @Post('specializations')
  @HttpCode(HttpStatus.CREATED)
  createSpecialization(
    @Body() dto: CreateSpecializationDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.createSpecialization(dto, user.email);
  }

  @ResponseMessage('Specializations retrieved successfully')
  @RequirePermissions('doctor_specializations.read')
  @Get('specializations')
  listSpecializations(@Query() query: DoctorMasterListQueryDto) {
    return this.mastersService.listSpecializations(query);
  }

  @ResponseMessage('Specialization retrieved successfully')
  @RequirePermissions('doctor_specializations.read')
  @Get('specializations/:refId')
  getSpecialization(@Param('refId', RefIdPipe) refId: string) {
    return this.mastersService.getSpecialization(refId);
  }

  @ResponseMessage('Specialization updated successfully')
  @RequirePermissions('doctor_specializations.update')
  @Patch('specializations/:refId')
  updateSpecialization(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSpecializationDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.updateSpecialization(refId, dto, user.email);
  }

  @ResponseMessage('Specialization status updated successfully')
  @RequirePermissions('doctor_specializations.status')
  @Patch('specializations/:refId/status')
  updateSpecializationStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateDoctorMasterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.updateSpecializationStatus(refId, dto, user.email);
  }

  @ResponseMessage('Specialization deleted successfully')
  @RequirePermissions('doctor_specializations.delete')
  @Delete('specializations/:refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSpecialization(@Param('refId', RefIdPipe) refId: string) {
    return this.mastersService.removeSpecialization(refId);
  }

  // Languages
  @ResponseMessage('Language created successfully')
  @RequirePermissions('doctor_languages.create')
  @Post('languages')
  @HttpCode(HttpStatus.CREATED)
  createLanguage(@Body() dto: CreateLanguageDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.mastersService.createLanguage(dto, user.email);
  }

  @ResponseMessage('Languages retrieved successfully')
  @RequirePermissions('doctor_languages.read')
  @Get('languages')
  listLanguages(@Query() query: DoctorMasterListQueryDto) {
    return this.mastersService.listLanguages(query);
  }

  @ResponseMessage('Language retrieved successfully')
  @RequirePermissions('doctor_languages.read')
  @Get('languages/:refId')
  getLanguage(@Param('refId', RefIdPipe) refId: string) {
    return this.mastersService.getLanguage(refId);
  }

  @ResponseMessage('Language updated successfully')
  @RequirePermissions('doctor_languages.update')
  @Patch('languages/:refId')
  updateLanguage(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateLanguageDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.updateLanguage(refId, dto, user.email);
  }

  @ResponseMessage('Language status updated successfully')
  @RequirePermissions('doctor_languages.status')
  @Patch('languages/:refId/status')
  updateLanguageStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateDoctorMasterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.updateLanguageStatus(refId, dto, user.email);
  }

  @ResponseMessage('Language deleted successfully')
  @RequirePermissions('doctor_languages.delete')
  @Delete('languages/:refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLanguage(@Param('refId', RefIdPipe) refId: string) {
    return this.mastersService.removeLanguage(refId);
  }

  // Qualifications
  @ResponseMessage('Qualification created successfully')
  @RequirePermissions('doctor_qualifications.create')
  @Post('qualifications')
  @HttpCode(HttpStatus.CREATED)
  createQualification(
    @Body() dto: CreateQualificationDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.createQualification(dto, user.email);
  }

  @ResponseMessage('Qualifications retrieved successfully')
  @RequirePermissions('doctor_qualifications.read')
  @Get('qualifications')
  listQualifications(@Query() query: DoctorMasterListQueryDto) {
    return this.mastersService.listQualifications(query);
  }

  @ResponseMessage('Qualification retrieved successfully')
  @RequirePermissions('doctor_qualifications.read')
  @Get('qualifications/:refId')
  getQualification(@Param('refId', RefIdPipe) refId: string) {
    return this.mastersService.getQualification(refId);
  }

  @ResponseMessage('Qualification updated successfully')
  @RequirePermissions('doctor_qualifications.update')
  @Patch('qualifications/:refId')
  updateQualification(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateQualificationDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.updateQualification(refId, dto, user.email);
  }

  @ResponseMessage('Qualification status updated successfully')
  @RequirePermissions('doctor_qualifications.status')
  @Patch('qualifications/:refId/status')
  updateQualificationStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateDoctorMasterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.mastersService.updateQualificationStatus(refId, dto, user.email);
  }

  @ResponseMessage('Qualification deleted successfully')
  @RequirePermissions('doctor_qualifications.delete')
  @Delete('qualifications/:refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeQualification(@Param('refId', RefIdPipe) refId: string) {
    return this.mastersService.removeQualification(refId);
  }
}
