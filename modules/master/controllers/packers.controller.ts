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
import { MasterListQueryDto } from '../dto/master-list-query.dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { PackersService } from '../services/packers.service';
import { UpdatePackerStatusDto } from '../dto/packer.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/packers')
export class PackersController {
  constructor(private readonly packersService: PackersService) {}

  @ResponseMessage('Packer created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.packersService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Packers retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.packersService.findAll(query);
  }

  @ResponseMessage('Packer retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.packersService.findOne(refId);
  }

  @ResponseMessage('Packer updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
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
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdatePackerStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.packersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Packer deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.packersService.remove(refId);
  }
}
