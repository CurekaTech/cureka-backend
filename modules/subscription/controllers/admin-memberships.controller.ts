import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  AdminMembershipPaymentQueryDto,
  AdminUserMembershipQueryDto,
} from '../dto/membership.dto';
import { MembershipPaymentsService } from '../services/membership-payments.service';
import { MembershipsService } from '../services/memberships.service';

@ApiTags('Admin Memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/memberships')
export class AdminMembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
    private readonly paymentsService: MembershipPaymentsService,
  ) {}

  @ApiOperation({ summary: 'List user memberships' })
  @ResponseMessage('User memberships fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('user_memberships.read')
  @Get()
  @HttpCode(HttpStatus.OK)
  list(@Query() query: AdminUserMembershipQueryDto) {
    return this.membershipsService.listAdmin(query);
  }

  @ApiOperation({ summary: 'List membership payments' })
  @ResponseMessage('Membership payments fetched successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('membership_payments.read')
  @Get('payments')
  @HttpCode(HttpStatus.OK)
  listPayments(@Query() query: AdminMembershipPaymentQueryDto) {
    return this.paymentsService.listAdmin(query);
  }
}
