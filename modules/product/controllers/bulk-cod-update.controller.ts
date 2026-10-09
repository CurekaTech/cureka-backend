import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RawResponse, RefIdPipe, ResponseMessage } from '@packages/common';
import { BulkCodUpdateService } from '../services/bulk-cod-update.service';

@ApiTags('Product Bulk COD Update')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('products/bulk-cod-update')
export class BulkCodUpdateController {
  constructor(private readonly bulkCodUpdateService: BulkCodUpdateService) {}

  @ApiOperation({ summary: 'Upload Excel/CSV COD sheet and queue job' })
  @ResponseMessage('COD update enqueued successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.update')
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkCodUpdateService.createJob(req, user.email);
  }

  @ApiOperation({ summary: 'Download COD update sample XLSX template' })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('template/download')
  async downloadTemplate(@Res() reply: FastifyReply) {
    const { fileName, fileBuffer } = await this.bulkCodUpdateService.getTemplateFile();
    return this.bulkCodUpdateService.sendTemplate(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Get COD update history list' })
  @ResponseMessage('COD update history retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('history')
  async getHistory(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.bulkCodUpdateService.getHistory(
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(limit) || 20)),
    );
  }

  @ApiOperation({ summary: 'Cancel a queued or running COD update' })
  @ResponseMessage('COD update cancel requested')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.update')
  @Post(':refId/cancel')
  async cancel(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkCodUpdateService.cancelJob(refId, user.email);
  }

  @ApiOperation({ summary: 'Get COD update job status' })
  @ResponseMessage('COD update status retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get(':refId')
  async getStatus(@Param('refId', RefIdPipe) refId: string) {
    return this.bulkCodUpdateService.getJobStatus(refId);
  }
}
