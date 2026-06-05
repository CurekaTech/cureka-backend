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

import { AttributesService } from '../services/attributes.service';

import { CreateAttributeDto, UpdateAttributeDto, UpdateAttributeStatusDto } from '../dto/attribute.dto';

import { PaginationQueryDto } from '@packages/common';

import { JwtAuthGuard } from '@packages/auth';

import { RolesGuard } from '@packages/auth';

import { Roles } from '@packages/auth';

import { CurrentAdminUser } from '@packages/auth';

import { IAdminJwtPayload } from '@packages/auth';

import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';

import { ResponseMessage } from '@packages/common';



@UseGuards(JwtAuthGuard, RolesGuard)

@Controller('master/attributes')

export class AttributesController {

  constructor(private readonly attributesService: AttributesService) {}



  @ResponseMessage('Attribute created successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Post()

  @HttpCode(HttpStatus.CREATED)

  create(@Body() dto: CreateAttributeDto, @CurrentAdminUser() user: IAdminJwtPayload) {

    return this.attributesService.create(dto, user.email);

  }



  @ResponseMessage('Attributes retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get()

  findAll(@Query() query: PaginationQueryDto) {

    return this.attributesService.findAll(query);

  }



  @ResponseMessage('Attribute retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get(':refId')

  findOne(@Param('refId', RefIdPipe) refId: string) {

    return this.attributesService.findOne(refId);

  }



  @ResponseMessage('Attribute status updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId/status')

  updateStatus(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateAttributeStatusDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.attributesService.updateStatus(refId, dto, user.email);

  }



  @ResponseMessage('Attribute updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId')

  update(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateAttributeDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.attributesService.update(refId, dto, user.email);

  }



  @ResponseMessage('Attribute deleted successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Delete(':refId')

  @HttpCode(HttpStatus.OK)

  remove(@Param('refId', RefIdPipe) refId: string) {

    return this.attributesService.remove(refId);

  }

}

