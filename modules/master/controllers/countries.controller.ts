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

import { CountriesService } from '../services/countries.service';

import {

  CreateCountryDto,

  UpdateCountryDto,

  UpdateCountryStatusDto,

} from '../dto/country.dto';

import { PaginationQueryDto } from '@packages/common';

import { JwtAuthGuard } from '@packages/auth';

import { RolesGuard } from '@packages/auth';

import { Roles } from '@packages/auth';

import { CurrentAdminUser } from '@packages/auth';

import { IAdminJwtPayload } from '@packages/auth';

import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';

import { ResponseMessage } from '@packages/common';



@UseGuards(JwtAuthGuard, RolesGuard)

@Controller('master/countries')

export class CountriesController {

  constructor(private readonly countriesService: CountriesService) {}



  @ResponseMessage('Country created successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Post()

  @HttpCode(HttpStatus.CREATED)

  create(@Body() dto: CreateCountryDto, @CurrentAdminUser() user: IAdminJwtPayload) {

    return this.countriesService.create(dto, user.email);

  }



  @ResponseMessage('Countries retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get()

  findAll(@Query() query: PaginationQueryDto) {

    return this.countriesService.findAll(query);

  }



  @ResponseMessage('Country retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get(':refId')

  findOne(@Param('refId', RefIdPipe) refId: string) {

    return this.countriesService.findOne(refId);

  }



  @ResponseMessage('Country status updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId/status')

  updateStatus(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateCountryStatusDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.countriesService.updateStatus(refId, dto, user.email);

  }



  @ResponseMessage('Country updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId')

  update(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateCountryDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.countriesService.update(refId, dto, user.email);

  }



  @ResponseMessage('Country deleted successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Delete(':refId')

  @HttpCode(HttpStatus.OK)

  remove(@Param('refId', RefIdPipe) refId: string) {

    return this.countriesService.remove(refId);

  }

}

