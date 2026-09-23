import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { GalleryService } from '../services/gallery.service';

@ApiTags('Gallery Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @ApiOperation({ summary: 'Upload single or multiple images to gallery' })
  @ResponseMessage('Images uploaded successfully')
  @RequirePermissions('gallery.create')
  @Post('upload')
  async upload(
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.galleryService.uploadImages(req, user.email);
  }

  @ApiOperation({ summary: 'List gallery images with pagination and search' })
  @ResponseMessage('Gallery images retrieved successfully')
  @RequirePermissions('gallery.read')
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = Math.min(limit ? parseInt(limit, 10) : 20, 10);
    return this.galleryService.getHistory(pageNum, limitNum, search);
  }

  @ApiOperation({ summary: 'Delete gallery image by Ref ID' })
  @ResponseMessage('Image deleted successfully')
  @RequirePermissions('gallery.delete')
  @Delete(':refId')
  async delete(@Param('refId', RefIdPipe) refId: string) {
    return this.galleryService.deleteImage(refId);
  }
}
