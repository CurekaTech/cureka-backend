import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { BannersService } from '../services/banners.service';
import {
  BannerQueryDto,
  ReorderBannersDto,
  UpdateBannerStatusDto,
} from '../dto/banner.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @ResponseMessage('Banner created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bannersService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Banners retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: BannerQueryDto) {
    return this.bannersService.findAll(query);
  }

  @ResponseMessage('Banners reordered successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('reorder')
  reorder(@Body() dto: ReorderBannersDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.bannersService.reorder(dto, user.email);
  }

  @ResponseMessage('Banner retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.bannersService.findOne(refId);
  }

  @ResponseMessage('Banner status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateBannerStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.bannersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Banner updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.bannersService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Banner deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.bannersService.remove(refId);
  }
}
