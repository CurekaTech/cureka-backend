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
import { ImportersService } from '../services/importers.service';
import { UpdateImporterStatusDto } from '../dto/importer.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/importers')
export class ImportersController {
  constructor(private readonly importersService: ImportersService) {}

  @ResponseMessage('Importer created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.importersService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Importers retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.importersService.findAll(query);
  }

  @ResponseMessage('Importer retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.importersService.findOne(refId);
  }

  @ResponseMessage('Importer updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.importersService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Importer status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateImporterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.importersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Importer deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.importersService.remove(refId);
  }
}
