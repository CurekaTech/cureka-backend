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
import { RefIdPipe } from '@common/pipes/ref-id.pipe';
import { StatesService } from '../services/states.service';
import {
  CreateStateDto,
  UpdateStateDto,
  UpdateStateStatusDto,
  StateQueryDto,
} from '../dto/state.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/states')
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @ResponseMessage('State created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStateDto, @CurrentUser() user: IJwtPayload) {
    return this.statesService.create(dto, user.email);
  }

  @ResponseMessage('States retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: StateQueryDto) {
    return this.statesService.findAll(query);
  }

  @ResponseMessage('State retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.statesService.findOne(refId);
  }

  @ResponseMessage('State status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateStateStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.statesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('State updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateStateDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.statesService.update(refId, dto, user.email);
  }

  @ResponseMessage('State deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.statesService.remove(refId);
  }
}
