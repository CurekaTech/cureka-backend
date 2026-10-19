import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { PaymentRequestsService } from '@modules/payment-requests/services/payment-requests.service';
import { RefundWalletAccountStatus } from '../enums/refund-wallet-account-status.enum';
import { RefundWalletService } from '../services/refund-wallet.service';

class UpdateWalletStatusDto {
  @IsEnum(RefundWalletAccountStatus)
  status!: RefundWalletAccountStatus;
}

class WalletPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

class ReconcileReservationsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

@ApiTags('Admin Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/wallets')
export class AdminWalletController {
  constructor(
    private readonly walletService: RefundWalletService,
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  @Get('reconciliation/pending-reservations')
  @RequirePermissions('refund_requests.read')
  @ApiOperation({ summary: 'List wallet reservations awaiting payment reconciliation' })
  @ResponseMessage('Pending wallet reservations retrieved successfully')
  pendingReservations(@Query() query: WalletPageQueryDto) {
    return this.walletService.getPendingReservations(query.page, query.limit);
  }

  @Post('reconciliation/release-definitive')
  @RequirePermissions('refund_requests.status')
  @ApiOperation({
    summary:
      'Release stale PENDING wallet reservations only when the linked payment request is FAILED, CANCELLED, or EXPIRED',
  })
  @ResponseMessage('Wallet reservation reconciliation completed')
  reconcileDefinitive(@Body() dto: ReconcileReservationsDto) {
    return this.paymentRequestsService.reconcileStaleWalletReservations(dto.limit);
  }

  @Get(':customerId/transactions')
  @RequirePermissions('refund_requests.read')
  @ApiOperation({ summary: 'List a customer wallet ledger' })
  @ResponseMessage('Wallet transactions retrieved successfully')
  transactions(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: WalletPageQueryDto,
  ) {
    return this.walletService.getCustomerTransactions(customerId, query.page, query.limit);
  }

  @Get(':customerId')
  @RequirePermissions('refund_requests.read')
  @ApiOperation({ summary: 'Get a customer wallet overview' })
  @ResponseMessage('Wallet overview retrieved successfully')
  overview(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.walletService.getAdminOverview(customerId);
  }

  @Patch(':customerId/status')
  @RequirePermissions('refund_requests.status')
  @ApiOperation({ summary: 'Freeze, disable, or activate a customer wallet' })
  @ResponseMessage('Wallet status updated successfully')
  updateStatus(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateWalletStatusDto,
    @CurrentAdminUser() admin: IAdminJwtPayload,
  ) {
    return this.walletService.setAccountStatus(
      customerId,
      dto.status,
      admin.sub,
      admin.email ?? admin.sub,
    );
  }
}
