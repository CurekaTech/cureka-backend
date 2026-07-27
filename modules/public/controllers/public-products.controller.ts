import { Controller, Get, Logger, Param, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
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

  /**
   * Legacy product_page_url paths: /public/products/shop/.../product-name/
   * Fastify requires `*` as the final route character (not `(.*)`).
   * Must be declared before `:slug` so multi-segment shop paths resolve here.
   */
  @ResponseMessage('Product retrieved successfully')
  @Get('shop/*')
  async findByProductPagePath(@Req() req: FastifyRequest) {
    const path = this.extractShopRelativePath(req);
    const key = `/shop/${path}`;
    this.logger.log(`[findBySlug] request product_page_url="${key}"`);
    const result = await this.publicProductsService.findBySlug(key);
    this.logger.log(
      `[findBySlug] response product_page_url="${key}" refId="${result.refId}" mediaWithUrl=${result.media.filter((m) => this.hasAccessibleUrl(m.url)).length}/${result.media.length}`,
    );
    return result;
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

  private extractShopRelativePath(req: FastifyRequest): string {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    const marker = '/public/products/shop/';
    const index = pathname.indexOf(marker);
    if (index >= 0) {
      return decodeURIComponent(pathname.slice(index + marker.length).replace(/^\/+|\/+$/g, ''));
    }

    const params = req.params as Record<string, string | undefined>;
    const fromParam = params['*'] ?? params['0'] ?? Object.values(params).find(Boolean) ?? '';
    return decodeURIComponent(String(fromParam).replace(/^\/+|\/+$/g, ''));
  }

  private hasAccessibleUrl(
    value: { url?: string } | string | null | undefined,
  ): boolean {
    if (!value) return false;
    if (typeof value === 'string') return value.length > 0;
    return typeof value.url === 'string' && value.url.length > 0;
  }
}
