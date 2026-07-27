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
import {
  CreateSupportFaqDto,
  SupportFaqQueryDto,
  UpdateSupportFaqDto,
  UpdateSupportFaqStatusDto,
} from '../dto/support.dto';
import { SupportFaqsService } from '../services/support-faqs.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('support/faqs')
export class AdminSupportFaqsController {
  constructor(private readonly faqsService: SupportFaqsService) {}

  @ResponseMessage('Support FAQ created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_faqs.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSupportFaqDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.faqsService.create(dto, user.email);
  }

  @ResponseMessage('Support FAQs retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_faqs.read')
  @Get()
  findAll(@Query() query: SupportFaqQueryDto) {
    return this.faqsService.findAll(query);
  }

  @ResponseMessage('Support FAQ retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_faqs.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.faqsService.findOne(refId);
  }

  @ResponseMessage('Support FAQ updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_faqs.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSupportFaqDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.faqsService.update(refId, dto, user.email);
  }

  @ResponseMessage('Support FAQ status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_faqs.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSupportFaqStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.faqsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Support FAQ deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_faqs.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.faqsService.remove(refId);
  }
}
