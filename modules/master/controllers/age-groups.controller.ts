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
  UseGuards,
} from '@nestjs/common';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { AgeGroupsService } from '../services/age-groups.service';
import {
  CreateAgeGroupDto,
  UpdateAgeGroupDto,
  UpdateAgeGroupStatusDto,
} from '../dto/age-group.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/age-groups')
export class AgeGroupsController {
  constructor(private readonly ageGroupsService: AgeGroupsService) {}

  @ResponseMessage('Age group created successfully')
  @RequirePermissions('age_groups.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAgeGroupDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.ageGroupsService.create(dto, user.email);
  }

  @ResponseMessage('Age groups retrieved successfully')
  @RequirePermissions('age_groups.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.ageGroupsService.findAll(query);
  }

  @ResponseMessage('Age group retrieved successfully')
  @RequirePermissions('age_groups.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.ageGroupsService.findOne(refId);
  }

  @ResponseMessage('Age group status updated successfully')
  @RequirePermissions('age_groups.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateAgeGroupStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.ageGroupsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Age group updated successfully')
  @RequirePermissions('age_groups.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateAgeGroupDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.ageGroupsService.update(refId, dto, user.email);
  }

  @ResponseMessage('Age group deleted successfully')
  @RequirePermissions('age_groups.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.ageGroupsService.remove(refId);
  }
}
