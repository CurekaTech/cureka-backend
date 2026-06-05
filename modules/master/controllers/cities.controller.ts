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

import { CitiesService } from '../services/cities.service';

import {

  CreateCityDto,

  UpdateCityDto,

  UpdateCityStatusDto,

  CityQueryDto,

} from '../dto/city.dto';

import { JwtAuthGuard } from '@packages/auth';

import { RolesGuard } from '@packages/auth';

import { Roles } from '@packages/auth';

import { CurrentAdminUser } from '@packages/auth';

import { IAdminJwtPayload } from '@packages/auth';

import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';

import { ResponseMessage } from '@packages/common';



@UseGuards(JwtAuthGuard, RolesGuard)

@Controller('master/cities')

export class CitiesController {

  constructor(private readonly citiesService: CitiesService) {}



  @ResponseMessage('City created successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Post()

  @HttpCode(HttpStatus.CREATED)

  create(@Body() dto: CreateCityDto, @CurrentAdminUser() user: IAdminJwtPayload) {

    return this.citiesService.create(dto, user.email);

  }



  @ResponseMessage('Cities retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get()

  findAll(@Query() query: CityQueryDto) {

    return this.citiesService.findAll(query);

  }



  @ResponseMessage('City retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get(':refId')

  findOne(@Param('refId', RefIdPipe) refId: string) {

    return this.citiesService.findOne(refId);

  }



  @ResponseMessage('City status updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId/status')

  updateStatus(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateCityStatusDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.citiesService.updateStatus(refId, dto, user.email);

  }



  @ResponseMessage('City updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId')

  update(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateCityDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.citiesService.update(refId, dto, user.email);

  }



  @ResponseMessage('City deleted successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Delete(':refId')

  @HttpCode(HttpStatus.OK)

  remove(@Param('refId', RefIdPipe) refId: string) {

    return this.citiesService.remove(refId);

  }

}

