import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogPostEntity } from '@modules/master/entities/blog-post.entity';
import { MasterModule } from '@modules/master/master.module';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductModule } from '@modules/product/product.module';
import { AdminPromotionalPagesController } from './controllers/admin-promotional-pages.controller';
import { PublicPromotionalPagesController } from './controllers/public-promotional-pages.controller';
import { PromotionalPageSectionItemEntity } from './entities/promotional-page-section-item.entity';
import { PromotionalPageSectionEntity } from './entities/promotional-page-section.entity';
import { PromotionalPageTargetEntity } from './entities/promotional-page-target.entity';
import { PromotionalPageEntity } from './entities/promotional-page.entity';
import { PromotionalPagesRepository } from './repositories/promotional-pages.repository';
import { PromotionalPageReferenceService } from './services/promotional-page-reference.service';
import { PromotionalPagesService } from './services/promotional-pages.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PromotionalPageEntity,
      PromotionalPageSectionEntity,
      PromotionalPageSectionItemEntity,
      PromotionalPageTargetEntity,
      ProductEntity,
      BlogPostEntity,
    ]),
    MasterModule,
    ProductModule,
  ],
  controllers: [AdminPromotionalPagesController, PublicPromotionalPagesController],
  providers: [PromotionalPagesRepository, PromotionalPageReferenceService, PromotionalPagesService],
  exports: [PromotionalPagesService],
})
export class PromotionalPagesModule {}
