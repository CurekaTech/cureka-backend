import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RawResponse, RefIdPipe, ResponseMessage } from '@packages/common';
import { BulkPriceUpdateService } from '../services/bulk-price-update.service';

@ApiTags('Product Bulk Price Update')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('products/bulk-price-update')
export class BulkPriceUpdateController {
  constructor(private readonly bulkPriceUpdateService: BulkPriceUpdateService) {}

  @ApiOperation({ summary: 'Upload Excel/CSV price sheet and queue job' })
  @ResponseMessage('Bulk price update enqueued successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.update')
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bulkPriceUpdateService.createJob(req, user.email);
  }

  @ApiOperation({ summary: 'Download bulk price update sample XLSX template' })
  @RawResponse()
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('template/download')
  async downloadTemplate(@Res() reply: FastifyReply) {
    const { fileName, fileBuffer } = await this.bulkPriceUpdateService.getTemplateFile();
    return this.bulkPriceUpdateService.sendTemplate(reply, fileName, fileBuffer);
  }

  @ApiOperation({ summary: 'Get bulk price update history list' })
  @ResponseMessage('Bulk price update history retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get('history')
  async getHistory(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.bulkPriceUpdateService.getHistory(pageNum, limitNum);
  }

  @ApiOperation({ summary: 'Cancel an in-flight bulk price update job' })
  @ResponseMessage('Bulk price update cancel requested')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.update')
  @Post(':refId/cancel')
  async cancel(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.bulkPriceUpdateService.cancelJob(refId, user.email);
  }

  @ApiOperation({ summary: 'Get bulk price update job status' })
  @ResponseMessage('Bulk price update status retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('products.read')
  @Get(':refId')
  async getStatus(@Param('refId', RefIdPipe) refId: string) {
    return this.bulkPriceUpdateService.getJobStatus(refId);
  }
}
