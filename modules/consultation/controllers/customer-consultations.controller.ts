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
import { ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { DoctorConsultationModuleEnabledGuard } from '@modules/doctor/guards/doctor-consultation-module-enabled.guard';
import {
  BookFollowUpDto,
  CancelConsultationDto,
  ConsultationListQueryDto,
  CreateConsultationBookingDto,
  RescheduleConsultationDto,
  VerifyConsultationPaymentDto,
} from '../dto/consultation.dto';
import { ConsultationsService } from '../services/consultations.service';

@ApiTags('Customer Consultations')
@UseGuards(DoctorConsultationModuleEnabledGuard, SessionCookieGuard)
@Controller('consultations')
export class CustomerConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @ResponseMessage('Consultation booked successfully')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  book(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CreateConsultationBookingDto,
  ) {
    return this.consultationsService.createBooking(user.sub, dto);
  }

  @ResponseMessage('Consultations retrieved successfully')
  @Get()
  list(@CurrentSessionUser() user: IUserSessionContext, @Query() query: ConsultationListQueryDto) {
    return this.consultationsService.listForCustomer(user.sub, query);
  }

  @ResponseMessage('Consultation retrieved successfully')
  @Get(':refId')
  getOne(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentSessionUser() user: IUserSessionContext,
  ) {
    return this.consultationsService.getByRefIdForCustomer(refId, user.sub);
  }

  @ResponseMessage('Consultation cancelled successfully')
  @ResponseMessage('Consultation rescheduled successfully')
  @Post(':refId/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: RescheduleConsultationDto,
  ) {
    return this.consultationsService.reschedule(refId, { type: 'CUSTOMER', id: user.sub }, dto);
  }

  @Post(':refId/cancel')
  cancel(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CancelConsultationDto,
  ) {
    return this.consultationsService.cancelByCustomer(refId, user.sub, dto);
  }

  @ResponseMessage('Payment verified successfully')
  @Post(':refId/verify-payment')
  verifyPayment(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: VerifyConsultationPaymentDto,
  ) {
    return this.consultationsService.verifyPaid(refId, dto.gatewayPaymentId);
  }

  @ResponseMessage('Follow-up booked successfully')
  @Post('follow-up/book')
  @HttpCode(HttpStatus.CREATED)
  bookFollowUp(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: BookFollowUpDto,
  ) {
    return this.consultationsService.bookFollowUp(user.sub, dto);
  }
}
