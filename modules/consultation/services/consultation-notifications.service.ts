import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConsultationNotificationsService {
  private readonly logger = new Logger(ConsultationNotificationsService.name);

  bookingConfirmed(payload: { refId: string; patientMobile: string }): void {
    this.logger.log(`[stub] bookingConfirmed refId=${payload.refId} mobile=${payload.patientMobile}`);
  }

  cancelled(payload: { refId: string; reason?: string | null }): void {
    this.logger.log(
      `[stub] cancelled refId=${payload.refId} reason=${payload.reason ?? 'n/a'}`,
    );
  }

  followUpRecommended(payload: { sourceRefId: string; doctorId: string }): void {
    this.logger.log(
      `[stub] followUpRecommended source=${payload.sourceRefId} doctorId=${payload.doctorId}`,
    );
  }

  paymentVerified(payload: { refId: string }): void {
    this.logger.log(`[stub] paymentVerified refId=${payload.refId}`);
  }

  rescheduled(payload: { refId: string; slotId: string }): void {
    this.logger.log(`[stub] rescheduled refId=${payload.refId} slotId=${payload.slotId}`);
  }
}
