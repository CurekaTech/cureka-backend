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

import { StatesService } from '../services/states.service';

import {

  CreateStateDto,

  UpdateStateDto,

  UpdateStateStatusDto,

  StateQueryDto,

} from '../dto/state.dto';

import { JwtAuthGuard } from '@packages/auth';

import { RolesGuard } from '@packages/auth';

import { Roles } from '@packages/auth';

import { CurrentAdminUser } from '@packages/auth';

import { IAdminJwtPayload } from '@packages/auth';

import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';

import { ResponseMessage } from '@packages/common';



@UseGuards(JwtAuthGuard, RolesGuard)

@Controller('master/states')

export class StatesController {

  constructor(private readonly statesService: StatesService) {}



  @ResponseMessage('State created successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Post()

  @HttpCode(HttpStatus.CREATED)

  create(@Body() dto: CreateStateDto, @CurrentAdminUser() user: IAdminJwtPayload) {

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

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.statesService.updateStatus(refId, dto, user.email);

  }



  @ResponseMessage('State updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId')

  update(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateStateDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

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

