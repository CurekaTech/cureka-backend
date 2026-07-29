import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RawResponse, RefIdPipe, ResponseMessage } from '@packages/common';
import { BulkUploadService } from '../services/bulk-upload.service';

@ApiTags('Product Bulk Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('products/bulk-upload')
export class BulkUploadController {
  constructor(
    private readonly bulkUploadService: BulkUploadService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Upload Excel/CSV product sheet and queue job' })
  @ResponseMessage('Bulk upload enqueued successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.create')
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkUploadService.createBulkUploadJob(req, user.email);
  }

  @ApiOperation({ summary: 'Download bulk upload sample XLSX template' })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
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
    summary: 'Export all products as editable bulk upload CSV (streams in batches)',
  })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('export')
  async exportProducts(@Res() reply: FastifyReply) {
    await this.bulkUploadService.streamExportToReply(reply);
  }

  @ApiOperation({ summary: 'Queue background bulk export job (CSV)' })
  @ResponseMessage('Bulk export enqueued successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Post('export')
  async queueExport(@CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkUploadService.createBulkExportJob(user.email);
  }

  @ApiOperation({ summary: 'Download completed bulk export CSV' })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('export/:refId/download')
  async downloadExport(@Param('refId', RefIdPipe) refId: string, @Res() reply: FastifyReply) {
    const { fileName, fileBuffer, contentType } =
      await this.bulkUploadService.getExportDownload(refId);
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
  @RequirePermissions('products.read')
  @Get('history')
  async getHistoryRoute(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.bulkUploadService.getHistory(pageNum, limitNum);
  }

  @ApiOperation({ summary: 'Get bulk upload history list' })
  @ResponseMessage('Bulk upload history retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get()
  async getHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.bulkUploadService.getHistory(pageNum, limitNum);
  }

  @ApiOperation({ summary: 'Cancel a running or queued bulk upload job' })
  @ResponseMessage('Bulk upload cancelled successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.create')
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
  @RequirePermissions('products.read')
  @Get(':refId')
  async getStatus(@Param('refId', RefIdPipe) refId: string) {
    return this.bulkUploadService.getJobStatus(refId);
  }
}
