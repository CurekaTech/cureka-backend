import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ApproveRefundRequestDto,
  AssignRefundRequestDto,
  CreateAdminRefundRequestDto,
  RefundCommentDto,
  RefundRequestListQueryDto,
  RejectRefundRequestDto,
  RetryRefundRequestDto,
} from '../dto/refund-request.dto';
import {
  FailCodPayoutDto,
  HoldCodPayoutDto,
  MarkCodPayoutPaidDto,
  ReopenCodPayoutVerificationDto,
  RetryCodPayoutDto,
  VerifyCodPayoutDto,
} from '../dto/cod-refund-payout.dto';
import { COD_PAYOUT_PERMISSIONS } from '../constants/cod-payout.constants';
import { RefundRequestedByType } from '../enums/refund-requested-by-type.enum';
import { RefundActor } from '../interfaces/refund-request.interface';
import { CodRefundPayoutService } from '../services/cod-refund-payout.service';
import { RefundRequestsService } from '../services/refund-request.service';

@ApiTags('Admin Refund Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/refund-requests')
export class AdminRefundRequestsController {
  constructor(
    private readonly refundRequestsService: RefundRequestsService,
    private readonly payoutService: CodRefundPayoutService,
  ) {}

  @ApiOperation({ summary: 'List refund requests' })
  @ResponseMessage('Refund requests retrieved successfully')
  @RequirePermissions('refund_requests.read')
  @Get()
  list(@Query() query: RefundRequestListQueryDto) {
    return this.refundRequestsService.list(query);
  }

  @ApiOperation({ summary: 'Create a refund request for an order' })
  @ResponseMessage('Refund request created successfully')
  @RequirePermissions('refund_requests.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAdminRefundRequestDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.refundRequestsService.createByAdmin(dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Get refund request details' })
  @ResponseMessage('Refund request retrieved successfully')
  @RequirePermissions('refund_requests.read')
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.refundRequestsService.getAdminDetail(id, this.toActor(user));
  }

  @ApiOperation({ summary: 'Move refund request to review' })
  @ResponseMessage('Refund request moved to review')
  @RequirePermissions('refund_requests.update')
  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: RefundCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.refundRequestsService.review(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Approve a refund request without calling the payment provider' })
  @ResponseMessage('Refund request approved')
  @RequirePermissions('refund_requests.approve')
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRefundRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.refundRequestsService.approve(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Reject a refund request' })
  @ResponseMessage('Refund request rejected')
  @RequirePermissions('refund_requests.reject')
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectRefundRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.refundRequestsService.reject(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Assign a refund request to a staff user' })
  @ResponseMessage('Refund request assigned')
  @RequirePermissions('refund_requests.update')
  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignRefundRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.refundRequestsService.assign(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Add an internal comment' })
  @ResponseMessage('Comment added')
  @RequirePermissions('refund_requests.update')
  @Post(':id/comments')
  comment(
    @Param('id') id: string,
    @Body() dto: RefundCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.refundRequestsService.addComment(id, dto, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Initiate the provider refund',
    description: 'Calls GoKwik, Razorpay, or Cashfree based on the original captured payment. The frontend cannot choose the provider.',
  })
  @ResponseMessage('Provider refund initiated')
  @RequirePermissions('refund_requests.status')
  @Post(':id/initiate')
  initiate(
    @Param('id') id: string,
    @Body() dto: RefundCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.refundRequestsService.initiate(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Retry a conclusively failed provider refund' })
  @ResponseMessage('Provider refund retry started')
  @RequirePermissions('refund_requests.status')
  @Post(':id/retry')
  retry(
    @Param('id') id: string,
    @Body() dto: RetryRefundRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.refundRequestsService.retry(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Reconcile provider refund status without creating another refund' })
  @ResponseMessage('Refund status reconciled')
  @RequirePermissions('refund_requests.status')
  @Post(':id/reconcile')
  reconcile(@Param('id') id: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.refundRequestsService.reconcile(id, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Get the COD payout for a refund (masked bank details only)',
  })
  @ResponseMessage('COD payout retrieved successfully')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.READ)
  @Get(':id/payout')
  getPayout(@Param('id') id: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.payoutService.getAdminPayout(id, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Reveal the full bank account number (audited)',
    description: 'Finance-only. The number is never written to logs or audit payloads.',
  })
  @ResponseMessage('Bank account number revealed')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.READ)
  @Post(':id/payout/reveal')
  reveal(@Param('id') id: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.payoutService.revealAccountNumber(id, this.toActor(user));
  }

  @ApiOperation({ summary: 'Verify submitted COD bank details' })
  @ResponseMessage('COD bank details verified')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.UPDATE)
  @Post(':id/payout/verify')
  verifyPayout(
    @Param('id') id: string,
    @Body() dto: VerifyCodPayoutDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.payoutService.verify(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Mark the COD bank transfer as processing' })
  @ResponseMessage('COD payout marked processing')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.STATUS)
  @Post(':id/payout/processing')
  markProcessing(
    @Param('id') id: string,
    @Body() dto: VerifyCodPayoutDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.payoutService.markProcessing(id, this.toActor(user), dto.comment);
  }

  @ApiOperation({
    summary: 'Record a completed bank transfer',
    description: 'UTR is mandatory. Approving the refund request is not enough to complete a COD refund.',
  })
  @ResponseMessage('COD payout marked paid')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.STATUS)
  @Post(':id/payout/paid')
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkCodPayoutPaidDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.payoutService.markPaid(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Mark the COD payout as failed' })
  @ResponseMessage('COD payout marked failed')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.STATUS)
  @Post(':id/payout/fail')
  failPayout(
    @Param('id') id: string,
    @Body() dto: FailCodPayoutDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.payoutService.markFailed(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Place the COD payout on hold' })
  @ResponseMessage('COD payout placed on hold')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.STATUS)
  @Post(':id/payout/hold')
  holdPayout(
    @Param('id') id: string,
    @Body() dto: HoldCodPayoutDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.payoutService.hold(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Retry a failed COD payout without creating another refund' })
  @ResponseMessage('COD payout retry started')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.STATUS)
  @Post(':id/payout/retry')
  retryPayout(
    @Param('id') id: string,
    @Body() dto: RetryCodPayoutDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.payoutService.retry(id, this.toActor(user), dto.comment);
  }

  @ApiOperation({
    summary: 'Reopen bank-detail verification so the customer can correct the account',
  })
  @ResponseMessage('COD payout verification reopened')
  @RequirePermissions(COD_PAYOUT_PERMISSIONS.UPDATE)
  @Post(':id/payout/reopen-verification')
  reopen(
    @Param('id') id: string,
    @Body() dto: ReopenCodPayoutVerificationDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.payoutService.reopenVerification(id, dto, this.toActor(user));
  }

  private toActor(user: IAdminJwtPayload): RefundActor {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
      type: RefundRequestedByType.ADMIN,
    };
  }
}
