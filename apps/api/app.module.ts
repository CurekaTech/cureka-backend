import { Module, Scope } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { PathAwareLoggingValidationPipe } from '@packages/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig, jwtConfig, ordersConfig, shiprocketConfig, shipwayConfig, storageConfig, typesenseConfig, unicommerceOrderConfig, unicommerceProductConfig, gokwikConfig, envValidationSchema } from './config';

import { DatabaseModule } from './database/database.module';
import { LoggerModule } from '@packages/logger';
import { EventsModule } from '@packages/events';
import { AppCacheModule } from '@packages/cache';
import { QueueModule } from '@packages/queue';
import { AuthModule } from '@modules/auth/auth.module';
import { AdminUsersModule } from '@modules/admin-users/admin-users.module';
import { UsersModule } from '@modules/users/users.module';
import { MasterModule } from '@modules/master/master.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthModule } from './health/health.module';
import { PublicModule } from '@modules/public/public.module';
import { ProductModule } from '@modules/product/product.module';
import { UnicommerceModule } from '@modules/unicommerce/unicommerce.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { RolesModule } from '@modules/roles/roles.module';
import { PaymentRequestsModule } from '@modules/payment-requests/payment-requests.module';
import { SearchModule } from '@modules/search/search.module';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { GalleryModule } from '@modules/gallery/gallery.module';
import { ShippingModule } from '@modules/shipping/shipping.module';
import { GokwikModule } from '@modules/gokwik/gokwik.module';

@Module({
  imports: [
    // Config — must be first
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, storageConfig, typesenseConfig, ordersConfig, shipwayConfig, shiprocketConfig, unicommerceOrderConfig, unicommerceProductConfig, gokwikConfig],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true,
      },
      cache: true,
    }),

    // Logging (from packages/logger)
    LoggerModule,

    // Redis cache (from packages/cache)
    AppCacheModule.forRoot(),

    // Redis queue (from packages/queue)
    QueueModule.forRoot(),

    // Domain events (from packages/events)
    EventsModule,

    // Database
    DatabaseModule,

    // Authentication (Global — provides JwtAuthGuard, RolesGuard, JwtStrategy)
    AuthModule,

    // Business modules
    AdminUsersModule,
    UsersModule,
    MasterModule,
    UploadsModule,
    HealthModule,
    PublicModule,
    ProductModule,
    UnicommerceModule,
    OrdersModule,
    RolesModule,
    PaymentRequestsModule,
    SearchModule,
    AdminSettingsModule,
    GalleryModule,
    ShippingModule,
    GokwikModule,
  ],
  providers: [
    // Global response envelope — wraps all controller returns with { success, data, message, timestamp }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      scope: Scope.REQUEST,
      useClass: PathAwareLoggingValidationPipe,
    },
  ],
})
export class AppModule {}
