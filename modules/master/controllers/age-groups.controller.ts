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
import { AgeGroupsService } from '../services/age-groups.service';
import {
  CreateAgeGroupDto,
  UpdateAgeGroupDto,
  UpdateAgeGroupStatusDto,
} from '../dto/age-group.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/age-groups')
export class AgeGroupsController {
  constructor(private readonly ageGroupsService: AgeGroupsService) {}

  @ResponseMessage('Age group created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAgeGroupDto, @CurrentUser() user: IJwtPayload) {
    return this.ageGroupsService.create(dto, user.email);
  }

  @ResponseMessage('Age groups retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.ageGroupsService.findAll(query);
  }

  @ResponseMessage('Age group retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ageGroupsService.findOne(id);
  }

  @ResponseMessage('Age group status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgeGroupStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.ageGroupsService.updateStatus(id, dto, user.email);
  }

  @ResponseMessage('Age group updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgeGroupDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.ageGroupsService.update(id, dto, user.email);
  }

  @ResponseMessage('Age group deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ageGroupsService.remove(id);
  }
}
