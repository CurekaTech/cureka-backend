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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  CmsPageQueryDto,
  CreateCmsPageDto,
  UpdateCmsPageDto,
  UpdateCmsPageStatusDto,
} from '../dto/cms-page.dto';
import { CmsPagesService } from '../services/cms-pages.service';

@ApiTags('CMS Pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/cms-pages')
export class CmsPagesController {
  constructor(private readonly cmsPagesService: CmsPagesService) {}

  @ApiOperation({ summary: 'List CMS pages' })
  @ResponseMessage('CMS pages retrieved successfully')
  @RequirePermissions('cms_pages.read')
  @Get()
  findAll(@Query() query: CmsPageQueryDto) {
    return this.cmsPagesService.findAll(query);
  }

  @ApiOperation({ summary: 'Get CMS page by slug (admin edit)' })
  @ResponseMessage('CMS page retrieved successfully')
  @RequirePermissions('cms_pages.read')
  @Get('by-slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.cmsPagesService.findOneBySlug(slug);
  }

  @ApiOperation({ summary: 'Get CMS page by refId' })
  @ResponseMessage('CMS page retrieved successfully')
  @RequirePermissions('cms_pages.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.cmsPagesService.findOne(refId);
  }

  @ApiOperation({
    summary: 'Create a CMS page (internal / optional — not used by Pages sidebar)',
  })
  @ResponseMessage('CMS page created successfully')
  @RequirePermissions('cms_pages.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCmsPageDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.cmsPagesService.create(dto, user.email);
  }

  @ApiOperation({ summary: 'Update CMS page content and SEO fields' })
  @ResponseMessage('CMS page updated successfully')
  @RequirePermissions('cms_pages.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCmsPageDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.cmsPagesService.update(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Update CMS page status' })
  @ResponseMessage('CMS page status updated successfully')
  @RequirePermissions('cms_pages.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCmsPageStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.cmsPagesService.updateStatus(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Soft-delete a non-predefined CMS page' })
  @ResponseMessage('CMS page deleted successfully')
  @RequirePermissions('cms_pages.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.cmsPagesService.remove(refId);
  }
}
