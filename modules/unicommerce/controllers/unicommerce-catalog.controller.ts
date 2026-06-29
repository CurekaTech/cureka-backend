import { Controller, Get, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UnicommerceCatalogService } from '../services/unicommerce-catalog.service';
import {
  UnicommerceProductsCountQueryDto,
  UnicommerceProductsQueryDto,
} from '../dto/unicommerce-products-query.dto';
import { UnicommerceApiKeyGuard } from '../guards/unicommerce-api-key.guard';
import { UnicommerceUnauthorizedFilter } from '../filters/unicommerce-exception.filter';

@Controller('unicommerce')
@UseFilters(UnicommerceUnauthorizedFilter)
export class UnicommerceCatalogController {
  constructor(private readonly catalogService: UnicommerceCatalogService) {}

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
}
