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

  Req,

  UseGuards,

} from '@nestjs/common';

import { FastifyRequest } from 'fastify';

import { RefIdPipe } from '@packages/common';

import { BrandsService } from '../services/brands.service';

import { UpdateBrandStatusDto } from '../dto/brand.dto';

import { PaginationQueryDto } from '@packages/common';

import { JwtAuthGuard } from '@packages/auth';

import { RolesGuard } from '@packages/auth';

import { Roles } from '@packages/auth';

import { CurrentAdminUser } from '@packages/auth';

import { IAdminJwtPayload } from '@packages/auth';

import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';

import { ResponseMessage } from '@packages/common';



@UseGuards(JwtAuthGuard, RolesGuard)

@Controller('master/brands')

export class BrandsController {

  constructor(private readonly brandsService: BrandsService) {}



  @ResponseMessage('Brand created successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Post()

  @HttpCode(HttpStatus.CREATED)

  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {

    return this.brandsService.createFromRequest(req, user.email);

  }



  @ResponseMessage('Brands retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get()

  findAll(@Query() query: PaginationQueryDto) {

    return this.brandsService.findAll(query);

  }



  @ResponseMessage('Brand retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get(':refId')

  findOne(@Param('refId', RefIdPipe) refId: string) {

    return this.brandsService.findOne(refId);

  }



  @ResponseMessage('Brand status updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId/status')

  updateStatus(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateBrandStatusDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.brandsService.updateStatus(refId, dto, user.email);

  }



  @ResponseMessage('Brand updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId')

  update(

    @Param('refId', RefIdPipe) refId: string,

    @Req() req: FastifyRequest,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.brandsService.updateFromRequest(refId, req, user.email);

  }



  @ResponseMessage('Brand deleted successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Delete(':refId')

  @HttpCode(HttpStatus.OK)

  remove(@Param('refId', RefIdPipe) refId: string) {

    return this.brandsService.remove(refId);

  }

}

