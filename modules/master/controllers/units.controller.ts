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
import { UnitsService } from '../services/units.service';
import { CreateUnitDto, UpdateUnitDto, UpdateUnitStatusDto } from '../dto/unit.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @ResponseMessage('Unit created successfully')
  @RequirePermissions('units.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUnitDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.unitsService.create(dto, user.email);
  }

  @ResponseMessage('Units retrieved successfully')
  @RequirePermissions('units.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.unitsService.findAll(query);
  }

  @ResponseMessage('Unit retrieved successfully')
  @RequirePermissions('units.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.unitsService.findOne(refId);
  }

  @ResponseMessage('Unit status updated successfully')
  @RequirePermissions('units.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateUnitStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.unitsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Unit updated successfully')
  @RequirePermissions('units.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateUnitDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.unitsService.update(refId, dto, user.email);
  }

  @ResponseMessage('Unit deleted successfully')
  @RequirePermissions('units.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.unitsService.remove(refId);
  }
}
