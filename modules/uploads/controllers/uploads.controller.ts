import {
  Controller,
  Param,
  ParseEnumPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UploadsService } from '../services/uploads.service';
import { UploadFolder } from '../enums/upload-folder.enum';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ResponseMessage } from '@packages/common';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @ResponseMessage('File uploaded successfully')
  @RequirePermissions('gallery.create')
  @Post(':folder')
  upload(
    @Param('folder', new ParseEnumPipe(UploadFolder)) folder: UploadFolder,
    @Req() req: FastifyRequest,
  ) {
    return this.uploadsService.uploadFromRequest(folder, req);
  }
}
