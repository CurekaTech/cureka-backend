import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { OrdersModule } from '@modules/orders/orders.module';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UsersModule } from '@modules/users/users.module';
import { AdminProductReviewsController } from './controllers/admin-product-reviews.controller';
import { PublicProductReviewsController } from './controllers/public-product-reviews.controller';
import { ProductReviewEntity } from './entities/product-review.entity';
import { ProductReviewsRepository } from './repositories/product-reviews.repository';
import { ProductReviewsService } from './services/product-reviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductReviewEntity, AdminUserEntity]),
    ProductModule,
    UsersModule,
    UploadsModule,
    OrdersModule,
  ],
  controllers: [AdminProductReviewsController, PublicProductReviewsController],
  providers: [ProductReviewsRepository, ProductReviewsService],
  exports: [ProductReviewsService],
})
export class ReviewsModule {}
