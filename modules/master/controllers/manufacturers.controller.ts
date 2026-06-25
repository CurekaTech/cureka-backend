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
import { RefIdPipe } from '@packages/common';
import { ManufacturersService } from '../services/manufacturers.service';
import { UpdateManufacturerStatusDto } from '../dto/manufacturer.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';
import { JwtAuthGuard } from '@packages/auth';
import { RolesGuard } from '@packages/auth';
import { Roles } from '@packages/auth';
import { CurrentAdminUser } from '@packages/auth';
import { IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@packages/common';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/manufacturers')
export class ManufacturersController {
  constructor(private readonly manufacturersService: ManufacturersService) {}

  @ResponseMessage('Manufacturer created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.manufacturersService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Manufacturers retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.manufacturersService.findAll(query);
  }

  @ResponseMessage('Manufacturer retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.manufacturersService.findOne(refId);
  }

  @ResponseMessage('Manufacturer updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.manufacturersService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Manufacturer status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateManufacturerStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.manufacturersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Manufacturer deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.manufacturersService.remove(refId);
  }
}
