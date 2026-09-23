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
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { CategoryFiltersService } from '../services/category-filters.service';
import {
  CategoryFilterQueryDto,
  CreateCategoryFilterDto,
  UpdateCategoryFilterDto,
  UpdateCategoryFilterStatusDto,
} from '../dto/category-filter.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/category-filters')
export class CategoryFiltersController {
  constructor(private readonly categoryFiltersService: CategoryFiltersService) {}

  @ResponseMessage('Category filter created successfully')
  @RequirePermissions('category_filters.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCategoryFilterDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.categoryFiltersService.create(dto, user.email);
  }

  @ResponseMessage('Category filters retrieved successfully')
  @RequirePermissions('category_filters.read')
  @Get()
  findAll(@Query() query: CategoryFilterQueryDto) {
    return this.categoryFiltersService.findAll(query);
  }

  @ResponseMessage('Category filter retrieved successfully')
  @RequirePermissions('category_filters.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.categoryFiltersService.findOne(refId);
  }

  @ResponseMessage('Category filter status updated successfully')
  @RequirePermissions('category_filters.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCategoryFilterStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoryFiltersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Category filter updated successfully')
  @RequirePermissions('category_filters.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCategoryFilterDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.categoryFiltersService.update(refId, dto, user.email);
  }

  @ResponseMessage('Category filter deleted successfully')
  @RequirePermissions('category_filters.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.categoryFiltersService.remove(refId);
  }
}
