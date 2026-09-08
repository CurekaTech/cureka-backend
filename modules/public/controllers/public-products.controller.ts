import { Controller, Get, Logger, Param, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ResponseMessage } from '@packages/common';
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import { PublicBrandCategoryFiltersQueryDto } from '../dto/public-brand-category-filters-query.dto';
import { PublicProductFiltersQueryDto } from '../dto/public-product-filters-query.dto';
import { YouMayAlsoLikeQueryDto } from '../dto/you-may-also-like-query.dto';
import { FrequentlyBoughtTogetherQueryDto } from '../dto/frequently-bought-together-query.dto';
import { PublicProductsService } from '../services/public-products.service';
import { PublicProductFiltersService } from '../services/public-product-filters.service';

@Controller('public/products')
export class PublicProductsController {
  private readonly logger = new Logger(PublicProductsController.name);

  constructor(
    private readonly publicProductsService: PublicProductsService,
    private readonly publicProductFiltersService: PublicProductFiltersService,
  ) {}

  @ResponseMessage('Products retrieved successfully')
  @Get()
  findAll(@Query() query: PublicProductQueryDto) {
    return this.publicProductsService.findAll(query);
  }

  @ResponseMessage('Products retrieved successfully')
  @Get('search')
  search(@Query() query: PublicProductQueryDto) {
    return this.publicProductsService.searchVariants(query);
  }

  /**
   * Applicable brands for the current PLP context — search + cursor pagination.
   *
   * GET /public/products/filters/brands?contextType=category&categorySlug=hair-care&facetSearch=abc
   */
  @ResponseMessage('Product brand filters retrieved successfully')
  @Get('filters/brands')
  findProductFilterBrands(@Query() query: PublicProductFiltersQueryDto) {
    return this.publicProductFiltersService.findBrandFacets(query);
  }

  /**
   * Brand PLP — category filter facets for products of a brand.
   *
   * GET /public/products/filters/categories?brandSlug=similac&page=1&limit=20
   */
  @ResponseMessage('Brand category filters retrieved successfully')
  @Get('filters/categories')
  findBrandCategoryFilters(@Query() query: PublicBrandCategoryFiltersQueryDto) {
    return this.publicProductsService.findBrandCategoryFilters(query);
  }

  /**
   * Faceted PLP sidebar — categories (nested children), brands, price, category-filters.
   *
   * GET /public/products/filters?contextType=healthConcern&healthConcernSlug=hair-fall
   */
  @ResponseMessage('Product filters retrieved successfully')
  @Get('filters')
  findProductFilters(@Query() query: PublicProductFiltersQueryDto) {
    return this.publicProductFiltersService.findFilters(query);
  }

  /**
   * "You May Also Like" — pass variant IDs from the cart (or product page) and receive
   * a paginated list of similar published products ranked by sub-category match, then
   * category, within ±35% price. Cart products are always excluded from results.
   *
   * GET /public/products/you-may-also-like?variantIds=<uuid1>,<uuid2>&page=1&limit=20
   */
  @ResponseMessage('You may also like products retrieved successfully')
  @Get('you-may-also-like')
  findYouMayAlsoLike(@Query() query: YouMayAlsoLikeQueryDto) {
    return this.publicProductsService.findYouMayAlsoLike(
      query.variantIds,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  /**
   * "Frequently Bought Together" — complementary recommendations for cart and/or PDP.
   *
   * Pass cart variant IDs and/or the current PDP variant. When cart is empty, still pass
   * the PDP variant so suggestions stay relevant; when `variantIds` is omitted entirely,
   * results fall back to site bestsellers.
   *
   * Cascade: FBT category rules → same deepest-category bestsellers → global bestsellers.
   * Seed/cart products are always excluded when variant IDs are provided.
   *
   * GET /public/products/frequently-bought-together?variantIds=<uuid1>,<uuid2>&page=1&limit=10
   * GET /public/products/frequently-bought-together?page=1&limit=10
   */
  @ResponseMessage('Frequently bought together products retrieved successfully')
  @Get('frequently-bought-together')
  findFrequentlyBoughtTogether(@Query() query: FrequentlyBoughtTogetherQueryDto) {
    return this.publicProductsService.findFrequentlyBoughtTogether(
      query.variantIds ?? [],
      query.page ?? 1,
      query.limit ?? 10,
    );
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

  /**
   * Related blogs on product details — priority:
   * direct product links → same category → sub-category → sub-sub-category (max 4).
   *
   * GET /public/products/:productId/related-blogs
   * `productId` may be product UUID or product refId.
   */
  @ResponseMessage('Related blogs retrieved successfully')
  @Get(':productId/related-blogs')
  getRelatedBlogs(@Param('productId') productId: string) {
    return this.publicProductsService.getRelatedBlogs(productId);
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
