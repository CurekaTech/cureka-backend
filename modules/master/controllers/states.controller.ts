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
import { StatesService } from '../services/states.service';
import {
  CreateStateDto,
  UpdateStateDto,
  UpdateStateStatusDto,
  StateQueryDto,
} from '../dto/state.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/states')
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @ResponseMessage('State created successfully')
  @RequirePermissions('states.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStateDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.statesService.create(dto, user.email);
  }

  @ResponseMessage('States retrieved successfully')
  @RequirePermissions('states.read')
  @Get()
  findAll(@Query() query: StateQueryDto) {
    return this.statesService.findAll(query);
  }

  @ResponseMessage('State retrieved successfully')
  @RequirePermissions('states.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.statesService.findOne(refId);
  }

  @ResponseMessage('State status updated successfully')
  @RequirePermissions('states.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateStateStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.statesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('State updated successfully')
  @RequirePermissions('states.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateStateDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.statesService.update(refId, dto, user.email);
  }

  @ResponseMessage('State deleted successfully')
  @RequirePermissions('states.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.statesService.remove(refId);
  }
}
