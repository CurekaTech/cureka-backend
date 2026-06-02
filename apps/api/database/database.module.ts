import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerOptions } from 'typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('database.url');

        if (!url) {
          throw new Error('DATABASE_URL is not configured');
        }

        return {
          type: 'postgres',
          url,
          autoLoadEntities: true,
          synchronize: false,
          logging: configService.get<LoggerOptions>('database.logging') ?? ['error'],
          ssl:
            configService.get<string>('app.nodeEnv') === 'production'
              ? { rejectUnauthorized: false }
              : false,
          // PgBouncer compatible settings — low pool size; PgBouncer handles the real pool
          extra: {
            statement_timeout: 30000,
            query_timeout: 30000,
          },
          poolSize: 5,
          connectTimeoutMS: 10000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
