import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig, jwtConfig, storageConfig, envValidationSchema } from './config';
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
import { HealthModule } from './health/health.module';
import { PublicModule } from '@modules/public/public.module';

@Module({
  imports: [
    // Config — must be first
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, storageConfig],
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
  ],
  providers: [
    // Global response envelope — wraps all controller returns with { success, data, message, timestamp }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
