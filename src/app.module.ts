import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig, jwtConfig, envValidationSchema } from './config';
import { DatabaseModule } from './database/database.module';
import { AppLoggerModule } from './shared/logger/logger.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // Config — must be first
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true,
      },
      cache: true,
    }),

    // Logging
    AppLoggerModule,

    // Database
    DatabaseModule,

    // Business modules
    AdminUsersModule,
    UsersModule,
  ],
})
export class AppModule {}
