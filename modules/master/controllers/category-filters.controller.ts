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
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { CategoryFiltersService } from '../services/category-filters.service';
import {
  CategoryFilterQueryDto,
  CreateCategoryFilterDto,
  UpdateCategoryFilterDto,
  UpdateCategoryFilterStatusDto,
} from '../dto/category-filter.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/category-filters')
export class CategoryFiltersController {
  constructor(private readonly categoryFiltersService: CategoryFiltersService) {}

  @ResponseMessage('Category filter created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCategoryFilterDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.categoryFiltersService.create(dto, user.email);
  }

  @ResponseMessage('Category filters retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: CategoryFilterQueryDto) {
    return this.categoryFiltersService.findAll(query);
  }

  @ResponseMessage('Category filter retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.categoryFiltersService.findOne(refId);
  }

  @ResponseMessage('Category filter status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCategoryFilterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoryFiltersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Category filter updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCategoryFilterDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoryFiltersService.update(refId, dto, user.email);
  }

  @ResponseMessage('Category filter deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.categoryFiltersService.remove(refId);
  }
}
