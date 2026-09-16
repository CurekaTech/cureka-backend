import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RawResponse, RefIdPipe, ResponseMessage } from '@packages/common';
import { CodBlocklistBulkService } from '../services/cod-blocklist-bulk.service';

@ApiTags('Admin COD Blocklist Bulk Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/cod-blocklist/bulk-upload')
export class AdminCodBlocklistBulkController {
  constructor(private readonly bulkService: CodBlocklistBulkService) {}

  @ApiOperation({ summary: 'Upload COD blocklist Excel/CSV and queue job' })
  @ResponseMessage('COD blocklist bulk upload enqueued successfully')
  @RequirePermissions('cod_blocklist.create')
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkService.createJob(req, user.email);
  }

  @ApiOperation({ summary: 'Download COD blocklist bulk upload sample XLSX template' })
  @RawResponse()
  @RequirePermissions('cod_blocklist.read')
  @Get('template/download')
  async downloadTemplate(@Res() reply: FastifyReply) {
    const { fileName, fileBuffer } = await this.bulkService.getTemplateFile();
    return this.bulkService.sendTemplate(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Get COD blocklist bulk upload history' })
  @ResponseMessage('COD blocklist bulk upload history retrieved successfully')
  @RequirePermissions('cod_blocklist.read')
  @Get('history')
  async getHistory(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.bulkService.getHistory(pageNum, limitNum);
  }

  @ApiOperation({ summary: 'Cancel an in-flight COD blocklist bulk upload job' })
  @ResponseMessage('COD blocklist bulk upload cancel requested')
  @RequirePermissions('cod_blocklist.create')
  @Post(':refId/cancel')
  async cancel(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.bulkService.cancelJob(refId, user.email);
  }

  @ApiOperation({ summary: 'Get COD blocklist bulk upload job status' })
  @ResponseMessage('COD blocklist bulk upload status retrieved successfully')
  @RequirePermissions('cod_blocklist.read')
  @Get(':refId')
  async getStatus(@Param('refId', RefIdPipe) refId: string) {
    return this.bulkService.getJobStatus(refId);
  }
}
