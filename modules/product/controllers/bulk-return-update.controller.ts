import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RawResponse, RefIdPipe, ResponseMessage } from '@packages/common';
import { BulkReturnUpdateService } from '../services/bulk-return-update.service';

@ApiTags('Product Bulk Return Update')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('products/bulk-return-update')
export class BulkReturnUpdateController {
  constructor(private readonly bulkReturnUpdateService: BulkReturnUpdateService) {}

  @ApiOperation({ summary: 'Upload Excel/CSV return and replacement sheet and queue job' })
  @ResponseMessage('Return and replacement update enqueued successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.update')
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkReturnUpdateService.createJob(req, user.email);
  }

  @ApiOperation({ summary: 'Download return and replacement update sample XLSX template' })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('template/download')
  async downloadTemplate(@Res() reply: FastifyReply) {
    const { fileName, fileBuffer } = await this.bulkReturnUpdateService.getTemplateFile();
    return this.bulkReturnUpdateService.sendTemplate(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Get return and replacement update history list' })
  @ResponseMessage('Return and replacement update history retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('history')
  async getHistory(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.bulkReturnUpdateService.getHistory(
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(limit) || 20)),
    );
  }

  @ApiOperation({ summary: 'Cancel a queued or running return and replacement update' })
  @ResponseMessage('Return and replacement update cancel requested')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.update')
  @Post(':refId/cancel')
  async cancel(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkReturnUpdateService.cancelJob(refId, user.email);
  }

  @ApiOperation({ summary: 'Get return and replacement update job status' })
  @ResponseMessage('Return and replacement update status retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get(':refId')
  async getStatus(@Param('refId', RefIdPipe) refId: string) {
    return this.bulkReturnUpdateService.getJobStatus(refId);
  }
}
