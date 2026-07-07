import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { WishlistController } from './controllers/wishlist.controller';
import { WishlistItemEntity } from './entities/wishlist-item.entity';
import { WishlistItemsRepository } from './repositories/wishlist-items.repository';
import { WishlistService } from './services/wishlist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WishlistItemEntity]),
    ProductModule,
    UploadsModule,
  ],
  controllers: [WishlistController],
  providers: [WishlistItemsRepository, WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
