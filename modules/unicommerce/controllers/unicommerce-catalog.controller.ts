import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly configService: ConfigService,
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
