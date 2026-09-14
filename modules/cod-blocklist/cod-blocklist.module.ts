import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { UsersModule } from '@modules/users/users.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { BulkUploadEntity } from '@modules/product/entities/bulk-upload.entity';
import { BulkUploadsRepository } from '@modules/product/repositories/bulk-uploads.repository';
import { QueueModule } from '@packages/queue';
import { AdminCodBlocklistController } from './controllers/admin-cod-blocklist.controller';
import { AdminCodBlocklistBulkController } from './controllers/admin-cod-blocklist-bulk.controller';
import { CodBlocklistEntryEntity } from './entities/cod-blocklist-entry.entity';
import { CodBlocklistRepository } from './repositories/cod-blocklist.repository';
import { CodBlocklistService } from './services/cod-blocklist.service';
import { CodBlocklistBulkService } from './services/cod-blocklist-bulk.service';
import { CodBlocklistBulkParserService } from './services/cod-blocklist-bulk-parser.service';
import { CodBlocklistBulkProcessor } from './processors/cod-blocklist-bulk.processor';

const COD_BLOCKLIST_BULK_PROCESSOR_ENABLED =
  (process.env.COD_BLOCKLIST_BULK_PROCESSOR_ENABLED ?? 'true').toLowerCase() === 'true';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CodBlocklistEntryEntity,
      UserEntity,
      AdminUserEntity,
      BulkUploadEntity,
    ]),
    UsersModule,
    UploadsModule,
    QueueModule.registerQueue('cod-blocklist-bulk-upload'),
  ],
  controllers: [AdminCodBlocklistController, AdminCodBlocklistBulkController],
  providers: [
    CodBlocklistRepository,
    CodBlocklistService,
    BulkUploadsRepository,
    CodBlocklistBulkService,
    CodBlocklistBulkParserService,
    ...(COD_BLOCKLIST_BULK_PROCESSOR_ENABLED ? [CodBlocklistBulkProcessor] : []),
  ],
  exports: [CodBlocklistService],
})
export class CodBlocklistModule {}
