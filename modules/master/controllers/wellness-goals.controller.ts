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
import { WellnessGoalsService } from '../services/wellness-goals.service';
import { UpdateWellnessGoalStatusDto } from '../dto/wellness-goal.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/wellness-goals')
export class WellnessGoalsController {
  constructor(private readonly wellnessGoalsService: WellnessGoalsService) {}

  @ResponseMessage('Wellness goal created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.wellnessGoalsService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Wellness goals retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.wellnessGoalsService.findAll(query);
  }

  @ResponseMessage('Wellness goal retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.wellnessGoalsService.findOne(refId);
  }

  @ResponseMessage('Wellness goal status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateWellnessGoalStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wellnessGoalsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Wellness goal updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wellnessGoalsService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Wellness goal deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.wellnessGoalsService.remove(refId);
  }
}
