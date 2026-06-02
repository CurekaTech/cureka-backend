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
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { CategoriesService } from '../services/categories.service';
import { UpdateCategoryStatusDto, CategoryQueryDto } from '../dto/category.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ResponseMessage('Category created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentUser() user: IJwtPayload) {
    return this.categoriesService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Categories retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll(query);
  }

  // NOTE: 'tree' must be declared before ':id' so NestJS does not parse the
  // literal "tree" as a UUID param.
  @ResponseMessage('Category tree retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('tree')
  findTree() {
    return this.categoriesService.findTree();
  }

  @ResponseMessage('Category retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(id);
  }

  @ResponseMessage('Category status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.categoriesService.updateStatus(id, dto, user.email);
  }

  @ResponseMessage('Category updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: FastifyRequest,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.categoriesService.updateFromRequest(id, req, user.email);
  }

  @ResponseMessage('Category deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id);
  }
}
