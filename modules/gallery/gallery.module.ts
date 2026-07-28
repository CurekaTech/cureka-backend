import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { UploadsModule } from '../uploads/uploads.module';
import { GalleryEntity } from './entities/gallery.entity';
import { GalleryRepository } from './repositories/gallery.repository';
import { GalleryService } from './services/gallery.service';
import { GalleryController } from './controllers/gallery.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GalleryEntity, AdminUserEntity]),
    UploadsModule,
  ],
  controllers: [GalleryController],
  providers: [GalleryRepository, GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
