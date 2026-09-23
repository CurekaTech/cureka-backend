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
import { WellnessGoalsService } from '../services/wellness-goals.service';
import { UpdateWellnessGoalStatusDto } from '../dto/wellness-goal.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/wellness-goals')
export class WellnessGoalsController {
  constructor(private readonly wellnessGoalsService: WellnessGoalsService) {}

  @ResponseMessage('Wellness goal created successfully')
  @RequirePermissions('wellness_goals.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.wellnessGoalsService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Wellness goals retrieved successfully')
  @RequirePermissions('wellness_goals.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.wellnessGoalsService.findAll(query);
  }

  @ResponseMessage('Wellness goal retrieved successfully')
  @RequirePermissions('wellness_goals.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.wellnessGoalsService.findOne(refId);
  }

  @ResponseMessage('Wellness goal status updated successfully')
  @RequirePermissions('wellness_goals.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateWellnessGoalStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wellnessGoalsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Wellness goal updated successfully')
  @RequirePermissions('wellness_goals.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wellnessGoalsService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Wellness goal deleted successfully')
  @RequirePermissions('wellness_goals.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.wellnessGoalsService.remove(refId);
  }
}
