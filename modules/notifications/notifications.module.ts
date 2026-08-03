import { Module } from '@nestjs/common';
import { OrderNotificationsService } from './services/order-notifications.service';
import { WhatsappService } from './services/whatsapp.service';

@Module({
  providers: [WhatsappService, OrderNotificationsService],
  exports: [OrderNotificationsService, WhatsappService],
})
export class NotificationsModule {}
