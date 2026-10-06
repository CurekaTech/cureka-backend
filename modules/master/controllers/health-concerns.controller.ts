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
import { HealthConcernsService } from '../services/health-concerns.service';
import { UpdateHealthConcernStatusDto, UpdateHealthConcernIndexDto } from '../dto/health-concern.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/health-concerns')
export class HealthConcernsController {
  constructor(private readonly healthConcernsService: HealthConcernsService) {}

  @ResponseMessage('Health concern created successfully')
  @RequirePermissions('health_concerns.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.healthConcernsService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Health concerns retrieved successfully')
  @RequirePermissions('health_concerns.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.healthConcernsService.findAll(query);
  }

  /**
   * Returns all health concerns flagged for the homepage, ordered by sortIndex.
   * Use this to build the drag-and-drop index management UI.
   */
  @ResponseMessage('Homepage health concerns retrieved successfully')
  @RequirePermissions('health_concerns.read')
  @Get('homepage')
  getHomePageConcerns() {
    return this.healthConcernsService.getHomePageConcerns();
  }

  @ResponseMessage('Health concern retrieved successfully')
  @RequirePermissions('health_concerns.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.healthConcernsService.findOne(refId);
  }

  @ResponseMessage('Health concern status updated successfully')
  @RequirePermissions('health_concerns.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateHealthConcernStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.healthConcernsService.updateStatus(refId, dto, user.email);
  }

  /** Updates the sortIndex (display order) of a homepage health concern. */
  @ResponseMessage('Health concern index updated successfully')
  @RequirePermissions('health_concerns.update')
  @Patch(':refId/index')
  updateIndex(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateHealthConcernIndexDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.healthConcernsService.updateIndex(refId, dto, user.email);
  }

  @ResponseMessage('Health concern updated successfully')
  @RequirePermissions('health_concerns.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.healthConcernsService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Health concern deleted successfully')
  @RequirePermissions('health_concerns.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.healthConcernsService.remove(refId);
  }
}
