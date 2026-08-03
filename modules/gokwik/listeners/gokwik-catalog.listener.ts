import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { CategoryUpdatedEvent, EVENTS, ProductUpdatedEvent } from '@packages/events';
import { DataSource } from 'typeorm';
import { GokwikQueueService } from '../services/gokwik-queue.service';

@Injectable()
export class GokwikCatalogListener {
  private readonly logger = new Logger(GokwikCatalogListener.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly queueService: GokwikQueueService,
  ) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async onProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    if (process.env['BYPASS_PRODUCT_SIDE_EFFECT_LISTENERS'] === 'true') {
      return;
    }
    if (!this.configService.get<boolean>('gokwik.catalogSyncEnabled')) {
      this.logger.debug(
        { refId: event.refId },
        'Skipping GoKwik product sync — GOKWIK_CATALOG_SYNC_ENABLED is not true',
      );
      return;
    }
    const product = await this.dataSource.getRepository(ProductEntity).findOne({
      where: { refId: event.refId },
      select: { id: true },
      withDeleted: true,
    });
    if (product) await this.queueService.enqueueProductSync(product.id);
  }

  @OnEvent(EVENTS.CATEGORY_UPDATED)
  async onCategoryUpdated(event: CategoryUpdatedEvent): Promise<void> {
    if (!this.configService.get<boolean>('gokwik.catalogSyncEnabled')) {
      this.logger.debug(
        { refId: event.refId },
        'Skipping GoKwik collection sync — GOKWIK_CATALOG_SYNC_ENABLED is not true',
      );
      return;
    }
    const category = await this.dataSource.getRepository(CategoryEntity).findOne({
      where: { refId: event.refId },
      select: { id: true },
      withDeleted: true,
    });
    if (category) await this.queueService.enqueueCollectionSync(category.id);
  }
}
