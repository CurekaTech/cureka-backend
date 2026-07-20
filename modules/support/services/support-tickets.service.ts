import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { AuditEntityType } from '@modules/audit/constants/audit-entity-type.constant';
import { AuditService } from '@modules/audit/services/audit.service';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ReasonWorkflow } from '@modules/master/enums/reason-workflow.enum';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import {
  AddTicketMessageDto,
  AssignSupportTicketDto,
  CreateSupportTicketDto,
  SupportTicketQueryDto,
  UpdateSupportTicketPriorityDto,
  UpdateSupportTicketStatusDto,
} from '../dto/support.dto';
import { SupportTicketEntity } from '../entities/support-ticket.entity';
import { SupportAuditAction } from '../enums/support-audit-action.enum';
import { SupportMessageSenderType } from '../enums/support-message-sender-type.enum';
import { SupportTicketPriority } from '../enums/support-ticket-priority.enum';
import { SupportTicketStatus } from '../enums/support-ticket-status.enum';
import { SupportTicketCategory } from '../enums/support-ticket-category.enum';
import { mapSupportTicket, mapSupportTicketSummary, mapTicketMessage } from '../mappers/support.mapper';
import { SupportNotificationsRepository } from '../repositories/support-notifications.repository';
import { SupportTicketsRepository } from '../repositories/support-tickets.repository';
import { TicketMessagesRepository } from '../repositories/ticket-messages.repository';
import { SupportTicketNumberService } from './support-ticket-number.service';
import { OrderSupportReasonsService } from './order-support-reasons.service';

const TICKET_UPLOAD_FIELDS = { attachmentFile: UploadFolder.SUPPORT_ATTACHMENTS } as const;

const WORKFLOW_TICKET_CATEGORY: Record<ReasonWorkflow, SupportTicketCategory> = {
  [ReasonWorkflow.RETURN]: SupportTicketCategory.ORDER_ISSUE,
  [ReasonWorkflow.REFUND]: SupportTicketCategory.REFUND,
  [ReasonWorkflow.REPLACEMENT]: SupportTicketCategory.ORDER_ISSUE,
};

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly ticketsRepo: SupportTicketsRepository,
    private readonly messagesRepo: TicketMessagesRepository,
    private readonly auditService: AuditService,
    private readonly notificationsRepo: SupportNotificationsRepository,
    private readonly ticketNumberService: SupportTicketNumberService,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly orderSupportReasonsService: OrderSupportReasonsService,
  ) {}

  async createFromJson(dto: CreateSupportTicketDto, user?: IUserSessionContext) {
    const resolved = await this.resolveOrderSupportFields(dto, user, false);
    return this.createTicket(dto, user, resolved);
  }

  async createFromRequest(req: FastifyRequest, user?: IUserSessionContext) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateSupportTicketDto,
      TICKET_UPLOAD_FIELDS,
    );

    const resolved = await this.resolveOrderSupportFields(
      dto,
      user,
      Boolean(uploadedUrls.attachmentFile),
    );
    const ticket = await this.createTicket(dto, user, resolved);

    if (uploadedUrls.attachmentFile) {
      const entity = await this.ticketsRepo.findByRefId(ticket.refId);
      if (entity) {
        await this.messagesRepo.create({
          ticketId: entity.id,
          senderType: user?.isRegistered
            ? SupportMessageSenderType.USER
            : SupportMessageSenderType.USER,
          senderId: user?.sub ?? dto.guestEmail ?? 'guest',
          message: 'Attachment uploaded with ticket',
          attachmentUrl: this.storageUrlEnricher.persist(uploadedUrls.attachmentFile),
        });
      }
    }

    return ticket;
  }

  private async resolveOrderSupportFields(
    dto: CreateSupportTicketDto,
    user?: IUserSessionContext,
    hasAttachment = false,
  ) {
    if (!dto.reasonRefId && !dto.workflow) {
      if (!dto.category) {
        throw new BadRequestException('Category is required');
      }
      return null;
    }

    if (!dto.workflow || !dto.reasonRefId || !dto.orderId?.trim()) {
      throw new BadRequestException(
        'Workflow, reason, and order ID are required for order support requests',
      );
    }

    const reason = await this.orderSupportReasonsService.findReasonByRefId(dto.reasonRefId);
    if (!reason || reason.status !== MasterStatus.ACTIVE) {
      throw new NotFoundException('Selected reason is not available');
    }

    if (!reason.workflows.includes(dto.workflow)) {
      throw new BadRequestException('Selected reason does not apply to this workflow');
    }

    const orderContext = await this.orderSupportReasonsService.resolveOrderContext(
      dto.orderId,
      user?.isRegistered ? user.sub : undefined,
    );
    if (!orderContext) {
      throw new NotFoundException('Order not found');
    }

    const activeReasons = await this.orderSupportReasonsService.findActiveReasons(
      dto.workflow,
      dto.orderId,
      user?.isRegistered ? user.sub : undefined,
    );
    if (!activeReasons.some((item) => item.refId === dto.reasonRefId)) {
      throw new BadRequestException('Selected reason is not available for this order');
    }

    if (reason.commentsRequired && dto.description.trim().length < 10) {
      throw new BadRequestException('Comments are required for the selected reason');
    }

    if (reason.imagesRequired && !hasAttachment) {
      throw new BadRequestException('An image attachment is required for the selected reason');
    }

    return {
      category: WORKFLOW_TICKET_CATEGORY[dto.workflow],
      orderId: orderContext.orderRefId,
      reasonRefId: reason.refId,
      reasonTitle: reason.title,
      workflow: dto.workflow,
      pickupMode: reason.pickupMode,
    };
  }

  private async createTicket(
    dto: CreateSupportTicketDto,
    user?: IUserSessionContext,
    orderSupport?: {
      category: SupportTicketCategory;
      orderId: string;
      reasonRefId: string;
      reasonTitle: string;
      workflow: ReasonWorkflow;
      pickupMode: string;
    } | null,
  ) {
    if (!user?.isRegistered) {
      if (!dto.guestName || !dto.guestEmail || !dto.guestMobile) {
        throw new BadRequestException('Guest name, email, and mobile are required');
      }
    }

    if (!orderSupport && dto.description.trim().length < 10) {
      throw new BadRequestException('Description must be at least 10 characters');
    }

    const resolvedDescription =
      orderSupport && !dto.description.trim()
        ? orderSupport.reasonTitle
        : dto.description;

    const refId = await generateUniqueRefId(dto.subject, (id) =>
      this.ticketsRepo.existsByRefId(id),
    );
    const ticketNumber = await this.ticketNumberService.generate();

    const entity = await this.ticketsRepo.create({
      refId,
      ticketNumber,
      userId: user?.isRegistered ? user.sub : null,
      guestName: user?.isRegistered
        ? [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' ') || null
        : dto.guestName ?? null,
      guestEmail: user?.isRegistered ? user.profile.email ?? null : dto.guestEmail ?? null,
      guestMobile: user?.isRegistered ? user.profile.mobileNumber ?? null : dto.guestMobile ?? null,
      category: orderSupport?.category ?? dto.category!,
      subject: dto.subject,
      description: resolvedDescription,
      orderId: orderSupport?.orderId ?? dto.orderId ?? null,
      reasonRefId: orderSupport?.reasonRefId ?? null,
      reasonTitle: orderSupport?.reasonTitle ?? null,
      workflow: orderSupport?.workflow ?? null,
      pickupMode: orderSupport?.pickupMode ?? null,
      status: SupportTicketStatus.OPEN,
      priority: SupportTicketPriority.MEDIUM,
      createdBy: user?.profile?.email ?? dto.guestEmail ?? 'guest',
      updatedBy: user?.profile?.email ?? dto.guestEmail ?? 'guest',
    });

    await this.auditService.log({
      entityType: AuditEntityType.SUPPORT_TICKET,
      entityId: entity.id,
      entityRefId: entity.refId,
      action: SupportAuditAction.CREATED,
      performedBy: user?.profile?.email ?? dto.guestEmail ?? 'guest',
      details: { ticketNumber },
    });

    return mapSupportTicket(entity);
  }

  async findAllAdmin(
    query: SupportTicketQueryDto,
  ): Promise<PaginatedResult<ReturnType<typeof mapSupportTicket>>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.ticketsRepo.findAllPaginated({
      ...pagination,
      status: query.status,
      category: query.category,
      assignedTo: query.assignedTo,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    return buildPaginatedResult(data.map(mapSupportTicket), total, pagination);
  }

  async findAllForUser(userId: string, query: SupportTicketQueryDto) {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.ticketsRepo.findUserSummariesPaginated({
      ...pagination,
      userId,
      status: query.status,
      category: query.category,
    });

    return buildPaginatedResult(data.map(mapSupportTicketSummary), total, pagination);
  }

  async findOneAdmin(refId: string) {
    const ticket = await this.getTicketOrThrow(refId);
    const messages = await this.messagesRepo.findByTicketId(ticket.id, true);
    const auditLogs = await this.auditService.findByEntity(
      AuditEntityType.SUPPORT_TICKET,
      ticket.id,
      'ASC',
    );

    return this.storageUrlEnricher.enrichDeep({
      ticket: mapSupportTicket(ticket),
      messages: messages.map(mapTicketMessage),
      auditLogs,
    });
  }

  async findOneForUser(refId: string, userId: string) {
    const ticket = await this.getTicketOrThrow(refId);
    if (ticket.userId !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    const messages = await this.messagesRepo.findByTicketId(ticket.id, false);

    return this.storageUrlEnricher.enrichDeep({
      ticket: mapSupportTicket(ticket),
      messages: messages.map(mapTicketMessage),
    });
  }

  async updateStatus(refId: string, dto: UpdateSupportTicketStatusDto, actor: string) {
    const ticket = await this.getTicketOrThrow(refId);
    const previousStatus = ticket.status;

    const updated = await this.ticketsRepo.updateByRefId(refId, {
      status: dto.status,
      updatedBy: actor,
    });

    await this.auditService.log({
      entityType: AuditEntityType.SUPPORT_TICKET,
      entityId: ticket.id,
      entityRefId: ticket.refId,
      action: SupportAuditAction.STATUS_CHANGED,
      performedBy: actor,
      details: { from: previousStatus, to: dto.status },
    });

    if (ticket.userId) {
      await this.notificationsRepo.create({
        userId: ticket.userId,
        ticketRefId: ticket.refId,
        title: 'Ticket status updated',
        message: `Your ticket ${ticket.ticketNumber} is now ${dto.status.replace('_', ' ')}.`,
      });
    }

    return mapSupportTicket(updated as SupportTicketEntity);
  }

  async assign(refId: string, dto: AssignSupportTicketDto, actor: string) {
    const ticket = await this.getTicketOrThrow(refId);

    const updated = await this.ticketsRepo.updateByRefId(refId, {
      assignedTo: dto.assignedTo,
      status:
        ticket.status === SupportTicketStatus.OPEN
          ? SupportTicketStatus.IN_PROGRESS
          : ticket.status,
      updatedBy: actor,
    });

    await this.auditService.log({
      entityType: AuditEntityType.SUPPORT_TICKET,
      entityId: ticket.id,
      entityRefId: ticket.refId,
      action: SupportAuditAction.ASSIGNED,
      performedBy: actor,
      details: { assignedTo: dto.assignedTo },
    });

    return mapSupportTicket(updated as SupportTicketEntity);
  }

  async updatePriority(refId: string, dto: UpdateSupportTicketPriorityDto, actor: string) {
    const ticket = await this.getTicketOrThrow(refId);

    const updated = await this.ticketsRepo.updateByRefId(refId, {
      priority: dto.priority,
      updatedBy: actor,
    });

    await this.auditService.log({
      entityType: AuditEntityType.SUPPORT_TICKET,
      entityId: ticket.id,
      entityRefId: ticket.refId,
      action: SupportAuditAction.PRIORITY_CHANGED,
      performedBy: actor,
      details: { priority: dto.priority },
    });

    return mapSupportTicket(updated as SupportTicketEntity);
  }

  async addMessage(
    refId: string,
    dto: AddTicketMessageDto,
    actor: string,
    senderType: SupportMessageSenderType,
    senderId?: string,
    userId?: string,
  ) {
    const ticket = await this.getTicketOrThrow(refId);

    if (userId && ticket.userId !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    const isInternal = dto.isInternalNote === true;

    const message = await this.messagesRepo.create({
      ticketId: ticket.id,
      senderType: isInternal ? SupportMessageSenderType.INTERNAL_NOTE : senderType,
      senderId: senderId ?? actor,
      message: dto.message,
    });

    await this.auditService.log({
      entityType: AuditEntityType.SUPPORT_TICKET,
      entityId: ticket.id,
      entityRefId: ticket.refId,
      action: isInternal
        ? SupportAuditAction.INTERNAL_NOTE_ADDED
        : SupportAuditAction.MESSAGE_ADDED,
      performedBy: actor,
      details: { messageRefId: message.refId },
    });

    if (!isInternal && ticket.userId && senderType === SupportMessageSenderType.ADMIN) {
      await this.notificationsRepo.create({
        userId: ticket.userId,
        ticketRefId: ticket.refId,
        title: 'New reply on your ticket',
        message: `Support team replied to ticket ${ticket.ticketNumber}.`,
      });
    }

    return this.storageUrlEnricher.enrichDeep(mapTicketMessage(message));
  }

  async addMessageFromRequest(
    refId: string,
    req: FastifyRequest,
    actor: string,
    senderType: SupportMessageSenderType,
    senderId?: string,
    userId?: string,
  ) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      AddTicketMessageDto,
      TICKET_UPLOAD_FIELDS,
    );

    const ticket = await this.getTicketOrThrow(refId);

    if (userId && ticket.userId !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    const isInternal = dto.isInternalNote === true;

    const message = await this.messagesRepo.create({
      ticketId: ticket.id,
      senderType: isInternal ? SupportMessageSenderType.INTERNAL_NOTE : senderType,
      senderId: senderId ?? actor,
      message: dto.message,
      attachmentUrl: uploadedUrls.attachmentFile
        ? this.storageUrlEnricher.persist(uploadedUrls.attachmentFile)
        : null,
    });

    await this.auditService.log({
      entityType: AuditEntityType.SUPPORT_TICKET,
      entityId: ticket.id,
      entityRefId: ticket.refId,
      action: isInternal
        ? SupportAuditAction.INTERNAL_NOTE_ADDED
        : SupportAuditAction.MESSAGE_ADDED,
      performedBy: actor,
      details: { messageRefId: message.refId },
    });

    return this.storageUrlEnricher.enrichDeep(mapTicketMessage(message));
  }

  async getReports() {
    return this.ticketsRepo.getReportsSummary();
  }

  async getNotifications(userId: string, unreadOnly = false) {
    return this.notificationsRepo.findByUserId(userId, unreadOnly);
  }

  async markNotificationsRead(userId: string, ids: string[]) {
    await this.notificationsRepo.markAsRead(userId, ids);
  }

  async getUnreadNotificationCount(userId: string) {
    return this.notificationsRepo.countUnread(userId);
  }

  private async getTicketOrThrow(refId: string): Promise<SupportTicketEntity> {
    const ticket = await this.ticketsRepo.findByRefId(refId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }
}
