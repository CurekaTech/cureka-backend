import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { HealthConcernsService } from '../services/health-concerns.service';
import { UpdateHealthConcernStatusDto } from '../dto/health-concern.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/health-concerns')
export class HealthConcernsController {
  constructor(private readonly healthConcernsService: HealthConcernsService) {}

  @ResponseMessage('Health concern created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentUser() user: IJwtPayload) {
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
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.healthConcernsService.findOne(id);
  }

  @ResponseMessage('Health concern status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHealthConcernStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.healthConcernsService.updateStatus(id, dto, user.email);
  }

  @ResponseMessage('Health concern updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: FastifyRequest,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.healthConcernsService.updateFromRequest(id, req, user.email);
  }

  @ResponseMessage('Health concern deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.healthConcernsService.remove(id);
  }
}
