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
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

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
