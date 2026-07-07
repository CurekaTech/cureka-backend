import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig, jwtConfig, ordersConfig, storageConfig, typesenseConfig, envValidationSchema } from './config';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from '@packages/logger';
import { EventsModule } from '@packages/events';
import { AppCacheModule } from '@packages/cache';
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
import { WishlistModule } from '@modules/wishlist/wishlist.module';

@Module({
  imports: [
    // Config — must be first
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, storageConfig, typesenseConfig, ordersConfig],
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
    WishlistModule,
  ],
  providers: [
    // Global response envelope — wraps all controller returns with { success, data, message, timestamp }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
