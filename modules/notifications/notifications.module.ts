import { Module } from '@nestjs/common';
import { Msg91SmsService } from './services/msg91-sms.service';
import { OrderNotificationsService } from './services/order-notifications.service';
import { WhatsappService } from './services/whatsapp.service';

@Module({
  providers: [WhatsappService, Msg91SmsService, OrderNotificationsService],
  exports: [OrderNotificationsService, WhatsappService, Msg91SmsService],
})
export class NotificationsModule {}
