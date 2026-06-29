import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import { PublicProductsService } from '../services/public-products.service';

@Controller('public/products')
export class PublicProductsController {
  private readonly logger = new Logger(PublicProductsController.name);

  constructor(private readonly publicProductsService: PublicProductsService) {}

  @ResponseMessage('Products retrieved successfully')
  @Get()
  findAll(@Query() query: PublicProductQueryDto) {
    return this.publicProductsService.findAll(query);
  }

  @ResponseMessage('Product variants retrieved successfully')
  @Get('search')
  search(@Query() query: PublicProductQueryDto) {
    return this.publicProductsService.searchVariants(query);
  }

  @ResponseMessage('Product retrieved successfully')
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    this.logger.log(`[findBySlug] request slug="${slug}"`);
    const result = await this.publicProductsService.findBySlug(slug);
    this.logger.log(
      `[findBySlug] response slug="${slug}" refId="${result.refId}" mediaWithUrl=${result.media.filter((m) => this.hasAccessibleUrl(m.url)).length}/${result.media.length}`,
    );
    return result;
  }

  private hasAccessibleUrl(
    value: { url?: string } | string | null | undefined,
  ): boolean {
    if (!value) return false;
    if (typeof value === 'string') return value.length > 0;
    return typeof value.url === 'string' && value.url.length > 0;
  }
}
