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
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { PackersService } from '../services/packers.service';
import { UpdatePackerStatusDto } from '../dto/packer.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('master/packers')
export class PackersController {
  constructor(private readonly packersService: PackersService) {}

  @ResponseMessage('Packer created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('packers.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.packersService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Packers retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('packers.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.packersService.findAll(query);
  }

  @ResponseMessage('Packer retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('packers.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.packersService.findOne(refId);
  }

  @ResponseMessage('Packer updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('packers.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.packersService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Packer status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('packers.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdatePackerStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.packersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Packer deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('packers.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.packersService.remove(refId);
  }
}
