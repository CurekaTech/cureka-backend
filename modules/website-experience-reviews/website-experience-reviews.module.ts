import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '@modules/orders/orders.module';
import { WebsiteExperienceReviewEntity } from './entities/website-experience-review.entity';
import { WebsiteExperienceReviewsRepository } from './repositories/website-experience-reviews.repository';
import { WebsiteExperienceReviewsService } from './services/website-experience-reviews.service';
import { PublicWebsiteExperienceReviewsController } from './controllers/public-website-experience-reviews.controller';
import { AdminWebsiteExperienceReviewsController } from './controllers/admin-website-experience-reviews.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WebsiteExperienceReviewEntity]), OrdersModule],
  controllers: [
    PublicWebsiteExperienceReviewsController,
    AdminWebsiteExperienceReviewsController,
  ],
  providers: [WebsiteExperienceReviewsRepository, WebsiteExperienceReviewsService],
  exports: [WebsiteExperienceReviewsService],
})
export class WebsiteExperienceReviewsModule {}
