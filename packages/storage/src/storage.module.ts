import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.constants';
import { LocalStorageProvider } from './local-storage.provider';
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
              throw new Error(
                'GCS storage driver is not configured yet. Set STORAGE_DRIVER=local for now.',
              );
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
