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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { OptionalSessionCookieGuard } from '@modules/auth/guards/optional-session-cookie.guard';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import {
  AddTicketMessageDto,
  CreateSupportTicketDto,
  MarkNotificationReadDto,
  SupportTicketQueryDto,
} from '../dto/support.dto';
import { SupportMessageSenderType } from '../enums/support-message-sender-type.enum';
import { SupportTicketsService } from '../services/support-tickets.service';

@ApiTags('Support Tickets')
@Controller('support/tickets')
export class UserSupportTicketsController {
  constructor(private readonly ticketsService: SupportTicketsService) {}

  @ApiOperation({ summary: 'Submit a support ticket (guest or logged-in)' })
  @ResponseMessage('Support ticket created successfully')
  @UseGuards(OptionalSessionCookieGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: FastifyRequest & { user?: IUserSessionContext },
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.ticketsService.createFromRequest(req, req.user);
    }
    return this.ticketsService.createFromJson(req.body as CreateSupportTicketDto, req.user);
  }

  @ApiOperation({ summary: 'List support tickets for logged-in user' })
  @ResponseMessage('Support tickets retrieved successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Get('my')
  findMine(
    @CurrentSessionUser() user: IUserSessionContext,
    @Query() query: SupportTicketQueryDto,
  ) {
    return this.ticketsService.findAllForUser(user.sub, query);
  }

  @ApiOperation({ summary: 'Get ticket detail for logged-in user' })
  @ResponseMessage('Support ticket retrieved successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Get('my/:refId')
  findOne(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentSessionUser() user: IUserSessionContext,
  ) {
    return this.ticketsService.findOneForUser(refId, user.sub);
  }

  @ApiOperation({ summary: 'Reply to own support ticket' })
  @ResponseMessage('Message added successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Post('my/:refId/messages')
  @HttpCode(HttpStatus.CREATED)
  addMessage(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentSessionUser() user: IUserSessionContext,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.ticketsService.addMessageFromRequest(
        refId,
        req,
        user.profile.email ?? user.sub,
        SupportMessageSenderType.USER,
        user.sub,
        user.sub,
      );
    }
    return this.ticketsService.addMessage(
      refId,
      req.body as AddTicketMessageDto,
      user.profile.email ?? user.sub,
      SupportMessageSenderType.USER,
      user.sub,
      user.sub,
    );
  }

  @ApiOperation({ summary: 'Get in-app support notifications' })
  @ResponseMessage('Notifications retrieved successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Get('notifications')
  getNotifications(@CurrentSessionUser() user: IUserSessionContext) {
    return this.ticketsService.getNotifications(user.sub);
  }

  @ApiOperation({ summary: 'Get unread notification count' })
  @ResponseMessage('Unread count retrieved successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Get('notifications/unread-count')
  getUnreadCount(@CurrentSessionUser() user: IUserSessionContext) {
    return this.ticketsService.getUnreadNotificationCount(user.sub);
  }

  @ApiOperation({ summary: 'Mark notifications as read' })
  @ResponseMessage('Notifications marked as read')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Patch('notifications/read')
  markRead(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: MarkNotificationReadDto,
  ) {
    return this.ticketsService.markNotificationsRead(user.sub, dto.ids);
  }
}
