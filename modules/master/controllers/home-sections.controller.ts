import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import {
  CreateHomeSectionDto,
  ReorderHomeSectionsDto,
  UpdateHomeSectionStatusDto,
} from '../dto/home-section.dto';
import { HomeSectionsService } from '../services/home-sections.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/home-sections')
export class HomeSectionsController {
  constructor(private readonly homeSectionsService: HomeSectionsService) {}

  @ResponseMessage('Home sections retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll() {
    return this.homeSectionsService.findAll();
  }

  @ResponseMessage('Home section indexes updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('reorder-index')
  reorder(@Body() dto: ReorderHomeSectionsDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.homeSectionsService.reorder(dto, user.email);
  }

  @ResponseMessage('Home section created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateHomeSectionDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.homeSectionsService.create(dto, user.email);
  }

  @ResponseMessage('Home section status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateHomeSectionStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.homeSectionsService.updateStatus(refId, dto, user.email);
  }
}
