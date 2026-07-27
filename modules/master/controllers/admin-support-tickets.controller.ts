import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  AddTicketMessageDto,
  AssignSupportTicketDto,
  SupportTicketQueryDto,
  UpdateSupportTicketPriorityDto,
  UpdateSupportTicketStatusDto,
} from '../dto/support.dto';
import { SupportMessageSenderType } from '../enums/support-message-sender-type.enum';
import { SupportTicketsService } from '../services/support-tickets.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/support/tickets')
export class AdminSupportTicketsController {
  constructor(private readonly ticketsService: SupportTicketsService) {}

  @ResponseMessage('Support tickets retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_tickets.read')
  @Get()
  findAll(@Query() query: SupportTicketQueryDto) {
    return this.ticketsService.findAllAdmin(query);
  }

  @ResponseMessage('Support reports retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_reports.read')
  @Get('reports/summary')
  getReports() {
    return this.ticketsService.getReports();
  }

  @ResponseMessage('Support ticket retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_tickets.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.ticketsService.findOneAdmin(refId);
  }

  @ResponseMessage('Support ticket status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_tickets.update')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSupportTicketStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.ticketsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Support ticket assigned successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_tickets.assign')
  @Patch(':refId/assign')
  assign(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: AssignSupportTicketDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.ticketsService.assign(refId, dto, user.email);
  }

  @ResponseMessage('Support ticket priority updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_tickets.update')
  @Patch(':refId/priority')
  updatePriority(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSupportTicketPriorityDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.ticketsService.updatePriority(refId, dto, user.email);
  }

  @ResponseMessage('Message added successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('support_tickets.update')
  @Post(':refId/messages')
  @HttpCode(HttpStatus.CREATED)
  addMessage(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.ticketsService.addMessageFromRequest(
        refId,
        req,
        user.email,
        SupportMessageSenderType.ADMIN,
        user.sub,
      );
    }
    return this.ticketsService.addMessage(
      refId,
      req.body as AddTicketMessageDto,
      user.email,
      SupportMessageSenderType.ADMIN,
      user.sub,
    );
  }
}
