import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RawResponse, RefIdPipe, ResponseMessage } from '@packages/common';
import { BulkUploadService } from '../services/bulk-upload.service';

@ApiTags('Product Bulk Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products/bulk-upload')
export class BulkUploadController {
  constructor(
    private readonly bulkUploadService: BulkUploadService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Upload Excel/CSV product sheet and queue job' })
  @ResponseMessage('Bulk upload enqueued successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    console.log('[BULK_UPLOAD_DEBUG][Controller.upload] API_CALLED', {
      method: req.method,
      url: req.url,
      userEmail: user.email,
      isMultipart: req.isMultipart(),
    });
    return this.bulkUploadService.createBulkUploadJob(req, user.email);
  }

  @ApiOperation({ summary: 'Download bulk upload sample XLSX template' })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('template/download')
  async downloadTemplate(@Res() reply: FastifyReply) {
    const { fileName, fileBuffer } = await this.bulkUploadService.getTemplateFile();
    return reply
      .code(200)
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(fileBuffer);
  }

  @ApiOperation({
    summary: 'Export all products as editable bulk upload file (default XLSX, optional CSV)',
  })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('export')
  async exportProducts(
    @Res() reply: FastifyReply,
    @Query('format') format?: string,
  ) {
    const exportTimeoutMs = this.configService.get<number>(
      'PRODUCT_BULK_EXPORT_TIMEOUT_MS',
      15 * 60 * 1000,
    );
    reply.raw.setTimeout(exportTimeoutMs);

    const normalizedFormat = format?.trim().toLowerCase();
    const exportFormat: 'xlsx' | 'csv' =
      normalizedFormat === 'csv' ? 'csv' : 'xlsx';

    const { fileName, fileBuffer, contentType } =
      await this.bulkUploadService.getExportFile(exportFormat);

    return reply
      .code(200)
      .header('Content-Type', contentType)
      .header('Content-Length', String(fileBuffer.length))
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(fileBuffer);
  }

  @ApiOperation({ summary: 'Get bulk upload history list' })
  @ResponseMessage('Bulk upload history retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('history')
  async getHistoryRoute(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    console.log('[BULK_UPLOAD_DEBUG][Controller.history] API_CALLED', { page: pageNum, limit: limitNum });
    return this.bulkUploadService.getHistory(pageNum, limitNum);
  }

  @ApiOperation({ summary: 'Get bulk upload history list' })
  @ResponseMessage('Bulk upload history retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  async getHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    console.log('[BULK_UPLOAD_DEBUG][Controller.getHistory] API_CALLED', { page: pageNum, limit: limitNum });
    return this.bulkUploadService.getHistory(pageNum, limitNum);
  }

  @ApiOperation({ summary: 'Cancel a running or queued bulk upload job' })
  @ResponseMessage('Bulk upload cancelled successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post(':refId/cancel')
  async cancel(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.bulkUploadService.cancelBulkUploadJob(refId, user.email);
  }

  @ApiOperation({ summary: 'Get bulk upload job status' })
  @ResponseMessage('Bulk upload status retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  async getStatus(@Param('refId', RefIdPipe) refId: string) {
    console.log('[BULK_UPLOAD_DEBUG][Controller.getStatus] API_CALLED', { refId });
    return this.bulkUploadService.getJobStatus(refId);
  }
}
