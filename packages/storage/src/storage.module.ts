import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.constants';
import { LocalStorageProvider } from './local-storage.provider';
import { GcsStorageProvider } from './gcs-storage.provider';
import { StorageService } from './storage.service';
import { IStorageProvider } from './storage.provider.interface';

@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: STORAGE_PROVIDER,
          useFactory: (configService: ConfigService): IStorageProvider => {
            const driver = configService.get<string>('storage.driver') ?? 'local';

            if (driver === 'gcs') {
              return new GcsStorageProvider(configService);
            }

            return new LocalStorageProvider(configService);
          },
          inject: [ConfigService],
        },
        StorageService,
      ],
      exports: [StorageService],
    };
  }
}
