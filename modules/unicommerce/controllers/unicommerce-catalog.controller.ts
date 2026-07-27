import { Controller, Get, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UnicommerceCatalogService } from '../services/unicommerce-catalog.service';
import {
  UnicommerceProductsCountQueryDto,
  UnicommerceProductsQueryDto,
} from '../dto/unicommerce-products-query.dto';
import { UnicommerceApiKeyGuard } from '../guards/unicommerce-api-key.guard';
import { UnicommerceUnauthorizedFilter } from '../filters/unicommerce-exception.filter';
import { UnicommerceProductQueueService } from '../services/unicommerce-product-queue.service';
import { ProductsRepository } from '@modules/product/repositories/products.repository';

@Controller('unicommerce')
@UseFilters(UnicommerceUnauthorizedFilter)
export class UnicommerceCatalogController {
  constructor(
    private readonly catalogService: UnicommerceCatalogService,
    private readonly queueService: UnicommerceProductQueueService,
    private readonly productsRepository: ProductsRepository,
  ) {}

  @Get('productsCount')
  @UseGuards(UnicommerceApiKeyGuard)
  async getProductsCount(
    @Query() _query: UnicommerceProductsCountQueryDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const result = await this.catalogService.getProductsCount();
    void res.send(result);
  }

  @Get('products')
  @UseGuards(UnicommerceApiKeyGuard)
  async getProducts(
    @Query() query: UnicommerceProductsQueryDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const result = await this.catalogService.getProducts(query);
    void res.send(result);
  }

  /**
   * Bulk-enqueues all published products for Unicommerce push.
   * POST /unicommerce/admin/bulk-sync
   * Auth: same unicommerce JWT (get via POST /unicommerce/authenticate)
   */
  @Post('admin/bulk-sync')
  @UseGuards(UnicommerceApiKeyGuard)
  async bulkSyncProducts(@Res() res: FastifyReply): Promise<void> {
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
