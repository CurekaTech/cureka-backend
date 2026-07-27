import { Controller, ForbiddenException, Headers, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply } from 'fastify';
import { UnicommerceProductQueueService } from '../services/unicommerce-product-queue.service';
import { ProductsRepository } from '@modules/product/repositories/products.repository';

@Controller('unicommerce')
export class UnicommerceCatalogController {
  constructor(
    private readonly queueService: UnicommerceProductQueueService,
    private readonly productsRepository: ProductsRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Bulk-enqueues all published products for Unicommerce push.
   * POST /unicommerce/admin/bulk-sync
   * Auth: Header  x-admin-secret: <UNICOMMERCE_PASSWORD from .env>
   */
  @Post('admin/bulk-sync')
  async bulkSyncProducts(
    @Headers('x-admin-secret') secret: string,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const expected = this.configService.get<string>('UNICOMMERCE_PASSWORD');
    if (!secret || secret !== expected) {
      throw new ForbiddenException('Invalid admin secret');
    }

    const refIds = await this.productsRepository.findAllPublishedRefIds();
    const version = Date.now().toString();

    let enqueued = 0;
    for (const refId of refIds) {
      await this.queueService.enqueuePushProduct(refId, version);
      enqueued++;
    }

    void res.send({
      successful: true,
      message: `Enqueued ${enqueued} products for Unicommerce push`,
      total: enqueued,
    });
  }
}
