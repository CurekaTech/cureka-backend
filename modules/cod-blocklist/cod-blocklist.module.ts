import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { UsersModule } from '@modules/users/users.module';
import { AdminCodBlocklistController } from './controllers/admin-cod-blocklist.controller';
import { CodBlocklistEntryEntity } from './entities/cod-blocklist-entry.entity';
import { CodBlocklistRepository } from './repositories/cod-blocklist.repository';
import { CodBlocklistService } from './services/cod-blocklist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CodBlocklistEntryEntity, UserEntity, AdminUserEntity]),
    UsersModule,
  ],
  controllers: [AdminCodBlocklistController],
  providers: [CodBlocklistRepository, CodBlocklistService],
  exports: [CodBlocklistService],
})
export class CodBlocklistModule {}
