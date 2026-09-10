import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
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
import { RETURN_PERMISSIONS } from '../constants/return-permissions.constants';
import {
  AdminCreateReturnRequestDto,
  ApproveNoPickupDto,
  ApproveReturnRequestDto,
  AssignReturnRequestDto,
  LinkReplacementOrderDto,
  ReceiveAtWarehouseDto,
  RejectReturnRequestDto,
  RequestAdditionalInformationDto,
  ReturnCommentDto,
  ReturnEligibilityQueryDto,
  ReturnListQueryDto,
  SchedulePickupDto,
  SubmitQcDto,
  UpdatePickupStatusDto,
} from '../dto/return-request.dto';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnActor } from '../interfaces/return-request.interface';
import { ReturnRequestsService } from '../services/return-requests.service';
import { ReturnWorkflowService } from '../services/return-workflow.service';

@ApiTags('Admin Returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(
    private readonly returnRequestsService: ReturnRequestsService,
    private readonly workflowService: ReturnWorkflowService,
  ) {}

  @ApiOperation({ summary: 'List return requests' })
  @ResponseMessage('Return requests retrieved successfully')
  @RequirePermissions(RETURN_PERMISSIONS.READ)
  @Get()
  list(@Query() query: ReturnListQueryDto) {
    return this.workflowService.list(query);
  }

  @ApiOperation({
    summary: 'Check which items of an order can be returned',
    description: 'Same evaluation the storefront sees, so admins and customers never disagree.',
  })
  @ResponseMessage('Return eligibility retrieved successfully')
  @RequirePermissions(RETURN_PERMISSIONS.READ)
  @Get('eligibility/:orderId')
  eligibility(@Param('orderId') orderId: string, @Query() query: ReturnEligibilityQueryDto) {
    return this.returnRequestsService.getEligibilityForAdmin(
      orderId,
      query.expiredProductClaim ?? false,
    );
  }

  @ApiOperation({
    summary: 'Create a return on behalf of a customer',
    description:
      'Supports an audited eligibility override. Creating a return never triggers a refund.',
  })
  @ResponseMessage('Return request created successfully')
  @RequirePermissions(RETURN_PERMISSIONS.CREATE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: AdminCreateReturnRequestDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.returnRequestsService.createByAdmin(dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Get return request details' })
  @ResponseMessage('Return request retrieved successfully')
  @RequirePermissions(RETURN_PERMISSIONS.READ)
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.workflowService.getDetail(id);
  }

  @ApiOperation({ summary: 'Move a return request to review' })
  @ResponseMessage('Return request moved to review')
  @RequirePermissions(RETURN_PERMISSIONS.UPDATE)
  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReturnCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.review(id, dto, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Approve a return request',
    description:
      'Approval never issues a refund. When pickup is required, Cureka immediately creates a Unicommerce reverse pickup and a Shipway reverse booking.',
  })
  @ResponseMessage('Return request approved')
  @RequirePermissions(RETURN_PERMISSIONS.APPROVE)
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveReturnRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.approve(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Reject a return request' })
  @ResponseMessage('Return request rejected')
  @RequirePermissions(RETURN_PERMISSIONS.REJECT)
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectReturnRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.reject(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Ask the customer for more information' })
  @ResponseMessage('Additional information requested')
  @RequirePermissions(RETURN_PERMISSIONS.UPDATE)
  @Post(':id/request-information')
  requestInformation(
    @Param('id') id: string,
    @Body() dto: RequestAdditionalInformationDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.requestAdditionalInformation(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Assign a return request to a staff user or role' })
  @ResponseMessage('Return request assigned')
  @RequirePermissions(RETURN_PERMISSIONS.UPDATE)
  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignReturnRequestDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.assign(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Add a comment visible to the customer' })
  @ResponseMessage('Comment added')
  @RequirePermissions(RETURN_PERMISSIONS.UPDATE)
  @Post(':id/comments')
  comment(
    @Param('id') id: string,
    @Body() dto: ReturnCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.addComment(id, dto, this.toActor(user), false);
  }

  @ApiOperation({ summary: 'Add an internal note that is never shown to the customer' })
  @ResponseMessage('Internal note added')
  @RequirePermissions(RETURN_PERMISSIONS.UPDATE)
  @Post(':id/internal-notes')
  internalNote(
    @Param('id') id: string,
    @Body() dto: ReturnCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.addComment(id, dto, this.toActor(user), true);
  }

  @ApiOperation({
    summary: 'Schedule the reverse pickup',
    description:
      'Notifies Unicommerce (WMS reverse pickup) and Shipway (courier reverse booking). Use MANUAL to record an AWB booked outside Cureka.',
  })
  @ResponseMessage('Reverse pickup scheduled')
  @RequirePermissions(RETURN_PERMISSIONS.STATUS)
  @Post(':id/pickup')
  schedulePickup(
    @Param('id') id: string,
    @Body() dto: SchedulePickupDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.schedulePickup(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Record a reverse-pickup status update' })
  @ResponseMessage('Pickup status updated')
  @RequirePermissions(RETURN_PERMISSIONS.STATUS)
  @Post(':id/pickup/status')
  updatePickupStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePickupStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.updatePickupStatus(id, dto, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Resolve the return without collecting the item',
    description: 'Allowed only when the captured product policy permits a no-pickup resolution.',
  })
  @ResponseMessage('No-pickup resolution approved')
  @RequirePermissions(RETURN_PERMISSIONS.APPROVE)
  @Post(':id/no-pickup')
  approveNoPickup(
    @Param('id') id: string,
    @Body() dto: ApproveNoPickupDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.approveNoPickup(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Mark the returned item as received at the warehouse' })
  @ResponseMessage('Return marked as received')
  @RequirePermissions(RETURN_PERMISSIONS.STATUS)
  @Post(':id/receive')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveAtWarehouseDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.receiveAtWarehouse(id, dto, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Submit the quality-check result',
    description: 'Supports partial acceptance; the refundable amount drops to the accepted units.',
  })
  @ResponseMessage('Quality check recorded')
  @RequirePermissions(RETURN_PERMISSIONS.STATUS)
  @Post(':id/qc')
  submitQc(
    @Param('id') id: string,
    @Body() dto: SubmitQcDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.submitQc(id, dto, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Create the refund for a cleared return',
    description:
      'Creates a refund request in the existing refund workflow. Finance still has to approve and initiate it — no money moves here.',
  })
  @ResponseMessage('Refund request created for return')
  @RequirePermissions(RETURN_PERMISSIONS.APPROVE)
  @Post(':id/refund')
  createRefund(
    @Param('id') id: string,
    @Body() dto: ReturnCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.createRefund(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Link an externally created replacement order' })
  @ResponseMessage('Replacement order linked')
  @RequirePermissions(RETURN_PERMISSIONS.STATUS)
  @Post(':id/replacement')
  linkReplacement(
    @Param('id') id: string,
    @Body() dto: LinkReplacementOrderDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.linkReplacementOrder(id, dto, this.toActor(user));
  }

  @ApiOperation({ summary: 'Close a fully resolved return' })
  @ResponseMessage('Return completed')
  @RequirePermissions(RETURN_PERMISSIONS.STATUS)
  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() dto: ReturnCommentDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.workflowService.complete(id, dto, this.toActor(user));
  }

  private toActor(user: IAdminJwtPayload): ReturnActor {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
      type: ReturnRequestedByType.ADMIN,
    };
  }
}
