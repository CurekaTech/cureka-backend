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
  UseGuards,
} from '@nestjs/common';
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
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.statesService.findOne(id);
  }

  @ResponseMessage('State status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStateStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.statesService.updateStatus(id, dto, user.email);
  }

  @ResponseMessage('State updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStateDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.statesService.update(id, dto, user.email);
  }

  @ResponseMessage('State deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.statesService.remove(id);
  }
}
