import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { GalleryService } from '../services/gallery.service';

@ApiTags('Gallery Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @ApiOperation({ summary: 'Upload single or multiple images to gallery' })
  @ResponseMessage('Images uploaded successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('upload')
  async upload(
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.galleryService.uploadImages(req, user.email);
  }

  @ApiOperation({ summary: 'List gallery images with pagination and search' })
  @ResponseMessage('Gallery images retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
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
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Delete(':refId')
  async delete(@Param('refId', RefIdPipe) refId: string) {
    return this.galleryService.deleteImage(refId);
  }
}
