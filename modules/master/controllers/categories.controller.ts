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

import { CategoriesService } from '../services/categories.service';

import { UpdateCategoryStatusDto, CategoryQueryDto } from '../dto/category.dto';

import { JwtAuthGuard } from '@packages/auth';

import { RolesGuard } from '@packages/auth';

import { Roles } from '@packages/auth';

import { CurrentAdminUser } from '@packages/auth';

import { IAdminJwtPayload } from '@packages/auth';

import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';

import { ResponseMessage } from '@packages/common';



@UseGuards(JwtAuthGuard, RolesGuard)

@Controller('master/categories')

export class CategoriesController {

  constructor(private readonly categoriesService: CategoriesService) {}



  @ResponseMessage('Category created successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Post()

  @HttpCode(HttpStatus.CREATED)

  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {

    return this.categoriesService.createFromRequest(req, user.email);

  }



  @ResponseMessage('Categories retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get()

  findAll(@Query() query: CategoryQueryDto) {

    return this.categoriesService.findAll(query);

  }



  // NOTE: 'tree' must be declared before ':refId' so NestJS does not parse the

  // literal "tree" as a refId param.

  @ResponseMessage('Category tree retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get('tree')

  findTree() {

    return this.categoriesService.findTree();

  }



  @ResponseMessage('Category retrieved successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Get(':refId')

  findOne(@Param('refId', RefIdPipe) refId: string) {

    return this.categoriesService.findOne(refId);

  }



  @ResponseMessage('Category status updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId/status')

  updateStatus(

    @Param('refId', RefIdPipe) refId: string,

    @Body() dto: UpdateCategoryStatusDto,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.categoriesService.updateStatus(refId, dto, user.email);

  }



  @ResponseMessage('Category updated successfully')

  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)

  @Patch(':refId')

  update(

    @Param('refId', RefIdPipe) refId: string,

    @Req() req: FastifyRequest,

    @CurrentAdminUser() user: IAdminJwtPayload,

  ) {

    return this.categoriesService.updateFromRequest(refId, req, user.email);

  }



  @ResponseMessage('Category deleted successfully')

  @Roles(AdminUserRole.SUPER_ADMIN)

  @Delete(':refId')

  @HttpCode(HttpStatus.OK)

  remove(@Param('refId', RefIdPipe) refId: string) {

    return this.categoriesService.remove(refId);

  }

}

