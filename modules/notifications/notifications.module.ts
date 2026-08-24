import { Module } from '@nestjs/common';
import { Msg91SmsService } from './services/msg91-sms.service';
import { OrderNotificationsService } from './services/order-notifications.service';

@Module({
  providers: [Msg91SmsService, OrderNotificationsService],
  exports: [OrderNotificationsService, Msg91SmsService],
})
export class NotificationsModule {}
