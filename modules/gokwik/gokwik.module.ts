import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrdersModule } from '@modules/orders/orders.module';
import { UsersModule } from '@modules/users/users.module';
import { GokwikCartController } from './controllers/gokwik-cart.controller';
import { GokwikOrderController } from './controllers/gokwik-order.controller';
import { GokwikCallbackGuard } from './guards/gokwik-callback.guard';
import { GokwikApiService } from './services/gokwik-api.service';
import { GokwikCartService } from './services/gokwik-cart.service';
import { GokwikOrderService } from './services/gokwik-order.service';

@Module({
  imports: [
    OrdersModule,
    UsersModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('gokwik.timeoutMs') ?? 15000,
        maxRedirects: 3,
      }),
    }),
  ],
  controllers: [GokwikCartController, GokwikOrderController],
  providers: [GokwikCartService, GokwikOrderService, GokwikApiService, GokwikCallbackGuard],
  exports: [GokwikApiService],
})
export class GokwikModule {}
