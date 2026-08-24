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

import { RefIdPipe } from '@packages/common';

import { AgeGroupsService } from '../services/age-groups.service';

import {
  CreateAgeGroupDto,
  UpdateAgeGroupDto,
  UpdateAgeGroupStatusDto,
} from '../dto/age-group.dto';

import { MasterListQueryDto } from '../dto/master-list-query.dto';

import { JwtAuthGuard } from '@packages/auth';

import { RolesGuard } from '@packages/auth';

import { Roles } from '@packages/auth';

import { CurrentAdminUser } from '@packages/auth';

import { IAdminJwtPayload } from '@packages/auth';

import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';

import { ResponseMessage } from '@packages/common';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/age-groups')
export class AgeGroupsController {
  constructor(private readonly ageGroupsService: AgeGroupsService) {}

  @ResponseMessage('Age group created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAgeGroupDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.ageGroupsService.create(dto, user.email);
  }

  @ResponseMessage('Age groups retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.ageGroupsService.findAll(query);
  }

  @ResponseMessage('Age group retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.ageGroupsService.findOne(refId);
  }

  @ResponseMessage('Age group status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateAgeGroupStatusDto,

    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.ageGroupsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Age group updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateAgeGroupDto,

    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.ageGroupsService.update(refId, dto, user.email);
  }

  @ResponseMessage('Age group deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.ageGroupsService.remove(refId);
  }
}
