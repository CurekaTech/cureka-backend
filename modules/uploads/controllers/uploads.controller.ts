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
import { JwtAuthGuard } from '@packages/auth';
import { RolesGuard } from '@packages/auth';
import { Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@packages/common';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @ResponseMessage('File uploaded successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post(':folder')
  upload(
    @Param('folder', new ParseEnumPipe(UploadFolder)) folder: UploadFolder,
    @Req() req: FastifyRequest,
  ) {
    return this.uploadsService.uploadFromRequest(folder, req);
  }
}
