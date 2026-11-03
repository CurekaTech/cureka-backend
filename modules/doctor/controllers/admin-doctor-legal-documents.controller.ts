import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  CreateLegalDocumentDraftDto,
  CreateLegalDocumentVersionDto,
} from '../dto/doctor-legal-admin.dto';
import { DoctorConsultationModuleEnabledGuard } from '../guards/doctor-consultation-module-enabled.guard';
import { DoctorLegalDocumentsService } from '../services/doctor-legal-documents.service';

@ApiTags('Admin Doctor Legal Documents')
@UseGuards(DoctorConsultationModuleEnabledGuard, JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
@Controller('admin/doctor-legal-documents')
export class AdminDoctorLegalDocumentsController {
  constructor(private readonly legalDocumentsService: DoctorLegalDocumentsService) {}

  @ResponseMessage('Legal documents retrieved successfully')
  @RequirePermissions('doctor_legal_documents.read')
  @Get()
  list() {
    return this.legalDocumentsService.listDocuments();
  }

  @ResponseMessage('Legal document draft created successfully')
  @RequirePermissions('doctor_legal_documents.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createDraft(
    @Body() dto: CreateLegalDocumentDraftDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.legalDocumentsService.createDocumentDraft(dto, {
      id: user.sub,
      email: user.email,
    });
  }

  @ResponseMessage('Draft version created successfully')
  @RequirePermissions('doctor_legal_documents.create')
  @Post(':refId/versions')
  @HttpCode(HttpStatus.CREATED)
  createVersion(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: CreateLegalDocumentVersionDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.legalDocumentsService.createDraftVersion(refId, dto, {
      id: user.sub,
      email: user.email,
    });
  }

  @ResponseMessage('Version published successfully')
  @RequirePermissions('doctor_legal_documents.update')
  @Post('versions/:versionId/publish')
  publish(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.legalDocumentsService.publishVersion(versionId, {
      id: user.sub,
      email: user.email,
    });
  }
}
