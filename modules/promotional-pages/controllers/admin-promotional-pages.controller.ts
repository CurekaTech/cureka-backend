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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { PROMOTIONAL_PAGE_PERMISSIONS } from '../constants/promotional-page-permissions.constants';
import {
  CreatePromotionalPageDto,
  PromotionalPageQueryDto,
  ReplacePromotionalSectionsDto,
  UpdatePromotionalPageDto,
  UpdatePromotionalPageStatusDto,
} from '../dto/promotional-page.dto';
import { PromotionalPagesService } from '../services/promotional-pages.service';

@ApiTags('Promotional Landing Pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/promotional-pages')
export class AdminPromotionalPagesController {
  constructor(private readonly promotionalPagesService: PromotionalPagesService) {}

  @ApiOperation({ summary: 'List promotional landing pages' })
  @ResponseMessage('Promotional pages retrieved successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.READ)
  @Get()
  findAll(@Query() query: PromotionalPageQueryDto) {
    return this.promotionalPagesService.findAll(query);
  }

  @ApiOperation({ summary: 'Preview a promotional page, including draft and scheduled content' })
  @ResponseMessage('Promotional page preview retrieved successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.PREVIEW)
  @Get(':refId/preview')
  preview(@Param('refId', RefIdPipe) refId: string) {
    return this.promotionalPagesService.preview(refId);
  }

  @ApiOperation({ summary: 'Get promotional page configuration' })
  @ResponseMessage('Promotional page retrieved successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.READ)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.promotionalPagesService.findOne(refId);
  }

  @ApiOperation({ summary: 'Create a promotional landing page' })
  @ResponseMessage('Promotional page created successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.CREATE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePromotionalPageDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.promotionalPagesService.create(dto, user.email);
  }

  @ApiOperation({ summary: 'Publish, unpublish, or schedule a promotional page' })
  @ResponseMessage('Promotional page status updated successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.STATUS)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdatePromotionalPageStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.promotionalPagesService.updateStatus(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Replace promotional page sections, order, visibility, and schedules' })
  @ResponseMessage('Promotional page sections updated successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.UPDATE)
  @Put(':refId/sections')
  replaceSections(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: ReplacePromotionalSectionsDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.promotionalPagesService.replaceSections(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Update promotional page details, SEO, schedule, or mappings' })
  @ResponseMessage('Promotional page updated successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.UPDATE)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdatePromotionalPageDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.promotionalPagesService.update(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Archive a promotional page' })
  @ResponseMessage('Promotional page archived successfully')
  @RequirePermissions(PROMOTIONAL_PAGE_PERMISSIONS.DELETE)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.promotionalPagesService.remove(refId, user.email);
  }
}
