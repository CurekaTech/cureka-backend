import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { AuditModule } from '@modules/audit/audit.module';
import { MasterModule } from '@modules/master/master.module';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { AdminSupportArticlesController } from './controllers/admin-support-articles.controller';
import { AdminSupportCategoriesController } from './controllers/admin-support-categories.controller';
import { AdminSupportFaqsController } from './controllers/admin-support-faqs.controller';
import { AdminSupportTicketsController } from './controllers/admin-support-tickets.controller';
import { PublicSupportController } from './controllers/public-support.controller';
import { UserSupportTicketsController } from './controllers/user-support-tickets.controller';
import { SupportArticleEntity } from './entities/support-article.entity';
import { SupportCategoryEntity } from './entities/support-category.entity';
import { SupportFaqEntity } from './entities/support-faq.entity';
import { SupportNotificationEntity } from './entities/support-notification.entity';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { TicketMessageEntity } from './entities/ticket-message.entity';
import { SupportArticlesRepository } from './repositories/support-articles.repository';
import { SupportCategoriesRepository } from './repositories/support-categories.repository';
import { SupportFaqsRepository } from './repositories/support-faqs.repository';
import { SupportNotificationsRepository } from './repositories/support-notifications.repository';
import { SupportTicketsRepository } from './repositories/support-tickets.repository';
import { TicketMessagesRepository } from './repositories/ticket-messages.repository';
import { SupportArticlesService } from './services/support-articles.service';
import { SupportCategoriesService } from './services/support-categories.service';
import { SupportFaqsService } from './services/support-faqs.service';
import { SupportTicketNumberService } from './services/support-ticket-number.service';
import { SupportTicketsService } from './services/support-tickets.service';
import { OrderSupportReasonsService } from './services/order-support-reasons.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportCategoryEntity,
      SupportArticleEntity,
      SupportFaqEntity,
      SupportTicketEntity,
      TicketMessageEntity,
      SupportNotificationEntity,
      AdminUserEntity,
      OrderEntity,
      ProductEntity,
    ]),
    AuditModule,
    MasterModule,
    UploadsModule,
  ],
  controllers: [
    AdminSupportCategoriesController,
    AdminSupportArticlesController,
    AdminSupportFaqsController,
    AdminSupportTicketsController,
    PublicSupportController,
    UserSupportTicketsController,
  ],
  providers: [
    SupportCategoriesRepository,
    SupportArticlesRepository,
    SupportFaqsRepository,
    SupportTicketsRepository,
    TicketMessagesRepository,
    SupportNotificationsRepository,
    SupportCategoriesService,
    SupportArticlesService,
    SupportFaqsService,
    SupportTicketsService,
    SupportTicketNumberService,
    OrderSupportReasonsService,
  ],
  exports: [
    SupportCategoriesService,
    SupportArticlesService,
    SupportFaqsService,
    SupportTicketsService,
  ],
})
export class SupportModule {}
