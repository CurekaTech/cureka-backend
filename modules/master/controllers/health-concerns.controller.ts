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
import { HealthConcernsService } from '../services/health-concerns.service';
import { UpdateHealthConcernStatusDto } from '../dto/health-concern.dto';
import { PaginationQueryDto } from '@packages/common';
import { JwtAuthGuard } from '@packages/auth';
import { RolesGuard } from '@packages/auth';
import { Roles } from '@packages/auth';
import { CurrentAdminUser } from '@packages/auth';
import { IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@packages/common';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/health-concerns')
export class HealthConcernsController {
  constructor(private readonly healthConcernsService: HealthConcernsService) {}

  @ResponseMessage('Health concern created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.healthConcernsService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Health concerns retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.healthConcernsService.findAll(query);
  }

  @ResponseMessage('Health concern retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.healthConcernsService.findOne(refId);
  }

  @ResponseMessage('Health concern status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateHealthConcernStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.healthConcernsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Health concern updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.healthConcernsService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Health concern deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.healthConcernsService.remove(refId);
  }
}
