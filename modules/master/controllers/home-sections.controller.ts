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
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ReorderHomeSectionsDto, UpdateHomeSectionStatusDto } from '../dto/home-section.dto';
import { HomeSectionsService } from '../services/home-sections.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/home-sections')
export class HomeSectionsController {
  constructor(private readonly homeSectionsService: HomeSectionsService) {}

  @ResponseMessage('Home sections retrieved successfully')
  @RequirePermissions('home_sections.read')
  @Get()
  findAll() {
    return this.homeSectionsService.findAll();
  }

  @ResponseMessage('Home section indexes updated successfully')
  @RequirePermissions('home_sections.update')
  @Patch('reorder-index')
  reorder(@Body() dto: ReorderHomeSectionsDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.homeSectionsService.reorder(dto, user.email);
  }

  @ResponseMessage('Home section created successfully')
  @RequirePermissions('home_sections.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.homeSectionsService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Home section retrieved successfully')
  @RequirePermissions('home_sections.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.homeSectionsService.findOne(refId);
  }

  @ResponseMessage('Home section status updated successfully')
  @RequirePermissions('home_sections.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateHomeSectionStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.homeSectionsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Home section updated successfully')
  @RequirePermissions('home_sections.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.homeSectionsService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Home section deleted successfully')
  @RequirePermissions('home_sections.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.homeSectionsService.remove(refId);
  }
}
