import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UsersModule } from '@modules/users/users.module';
import { CartEntity } from './entities/cart.entity';
import { CartItemEntity } from './entities/cart-item.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { CartController } from './controllers/cart.controller';
import { OrdersController } from './controllers/orders.controller';
import { CartsRepository } from './repositories/carts.repository';
import { CartItemsRepository } from './repositories/cart-items.repository';
import { OrdersRepository } from './repositories/orders.repository';
import { OrderItemsRepository } from './repositories/order-items.repository';
import { CartService } from './services/cart.service';
import { CheckoutService } from './services/checkout.service';
import { OrdersService } from './services/orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CartEntity, CartItemEntity, OrderEntity, OrderItemEntity]),
    UsersModule,
    UploadsModule,
  ],
  controllers: [CartController, OrdersController],
  providers: [
    CartsRepository,
    CartItemsRepository,
    OrdersRepository,
    OrderItemsRepository,
    CartService,
    CheckoutService,
    OrdersService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
