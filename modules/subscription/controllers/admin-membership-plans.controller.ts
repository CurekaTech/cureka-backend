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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  AdminMembershipPlanQueryDto,
  CreateMembershipBenefitDto,
  CreateMembershipPlanDto,
  UpdateMembershipBenefitDto,
  UpdateMembershipPlanDto,
} from '../dto/membership.dto';
import { MembershipBenefitsService } from '../services/membership-benefits.service';
import { MembershipPlansService } from '../services/membership-plans.service';

@ApiTags('Admin Membership Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/memberships/plans')
export class AdminMembershipPlansController {
  constructor(
    private readonly plansService: MembershipPlansService,
    private readonly benefitsService: MembershipBenefitsService,
  ) {}

  @ApiOperation({ summary: 'Create membership plan' })
  @ResponseMessage('Membership plan created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_plans.create')
  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateMembershipPlanDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.plansService.create(dto, user.email);
  }

  @ApiOperation({ summary: 'List membership plans' })
  @ResponseMessage('Membership plans fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_plans.read')
  @Get()
  @HttpCode(HttpStatus.OK)
  list(@Query() query: AdminMembershipPlanQueryDto) {
    return this.plansService.listAdmin(query);
  }

  // Static `benefits/:benefitId` routes must be registered before `:idOrRefId`
  @ApiOperation({ summary: 'Update membership benefit' })
  @ResponseMessage('Membership benefit updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_benefits.update')
  @Patch('benefits/:benefitId')
  @HttpCode(HttpStatus.OK)
  updateBenefit(
    @Param('benefitId', ParseUUIDPipe) benefitId: string,
    @Body() dto: UpdateMembershipBenefitDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.benefitsService.update(benefitId, dto, user.email);
  }

  @ApiOperation({ summary: 'Delete membership benefit' })
  @ResponseMessage('Membership benefit deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_benefits.delete')
  @Delete('benefits/:benefitId')
  @HttpCode(HttpStatus.OK)
  removeBenefit(
    @Param('benefitId', ParseUUIDPipe) benefitId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.benefitsService.softDelete(benefitId, user.email);
  }

  @ApiOperation({ summary: 'List benefits for a plan by id or refId' })
  @ResponseMessage('Membership benefits fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_benefits.read')
  @Get(':idOrRefId/benefits')
  @HttpCode(HttpStatus.OK)
  async listBenefits(@Param('idOrRefId') idOrRefId: string) {
    const planId = await this.plansService.resolveId(idOrRefId);
    return this.benefitsService.listByPlan(planId);
  }

  @ApiOperation({ summary: 'Add benefit to plan by id or refId' })
  @ResponseMessage('Membership benefit created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_benefits.create')
  @Post(':idOrRefId/benefits')
  @HttpCode(HttpStatus.OK)
  async addBenefit(
    @Param('idOrRefId') idOrRefId: string,
    @Body() dto: CreateMembershipBenefitDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const planId = await this.plansService.resolveId(idOrRefId);
    return this.benefitsService.create(planId, dto, user.email);
  }

  @ApiOperation({ summary: 'Get membership plan by id or refId' })
  @ResponseMessage('Membership plan fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_plans.read')
  @Get(':idOrRefId')
  @HttpCode(HttpStatus.OK)
  getOne(@Param('idOrRefId') idOrRefId: string) {
    return this.plansService.findByIdOrRefId(idOrRefId);
  }

  @ApiOperation({ summary: 'Update membership plan by id or refId' })
  @ResponseMessage('Membership plan updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_plans.update')
  @Patch(':idOrRefId')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('idOrRefId') idOrRefId: string,
    @Body() dto: UpdateMembershipPlanDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.plansService.update(idOrRefId, dto, user.email);
  }

  @ApiOperation({ summary: 'Delete membership plan by id or refId' })
  @ResponseMessage('Membership plan deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_plans.delete')
  @Delete(':idOrRefId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('idOrRefId') idOrRefId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.plansService.softDelete(idOrRefId, user.email);
  }
}
