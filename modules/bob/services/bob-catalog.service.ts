import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductsService } from '@modules/product/services/products.service';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { StorageService } from '@packages/storage';
import { BobProductResolver } from './bob-product-resolver.service';
import { bobCatalogueProductId } from '../utils/bob-product-id.util';
import { isUuid } from '../utils/bob.util';
import {
  collectImageRefs,
  mapBobCategory,
  mapBobProductDetail,
  mapBobProductSummary,
  mapBobVariantDetail,
} from '../mappers/bob.mapper';
import { BobListProductsQueryDto } from '../dto/bob.dto';
import {
  BobCategory,
  BobProductDetail,
  BobProductList,
  BobProductSummary,
  BobVariantDetail,
} from '../interfaces/bob.interface';

const PRODUCT_PAGE_SIZE = 100;
const PRODUCT_LOAD_CONCURRENCY = 4;
const DEFAULT_SEARCH_PAGE_SIZE = 20;

@Injectable()
export class BobCatalogService {
  private readonly logger = new Logger(BobCatalogService.name);

  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly productsService: ProductsService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly bobProductResolver: BobProductResolver,
  ) {}

  async listCategories(): Promise<BobCategory[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    const byId = new Map(categories.map((category) => [category.id, category]));
    this.logger.log({ count: categories.length }, '[BOB inbound] GET /categories');
    return categories.map((category) => {
      const parent = category.parentCategoryId ? byId.get(category.parentCategoryId) : undefined;
      return mapBobCategory(category, parent ?? null);
    });
  }

  async listProductsByCategory(categoryId: string): Promise<BobProductSummary[]> {
    const category = await this.resolveCategory(categoryId);
    const refIds = await this.productsRepository.findPublishedRefIdsByCategoryId(category.id);
    const products = this.onlyCatalogueProducts(
      await this.loadPublishedByRefIds(refIds),
      'GET /categories/:categoryId/products',
    );
    return products.map(mapBobProductSummary);
  }

  async getProduct(productId: string): Promise<BobProductDetail> {
    const product = await this.bobProductResolver.findPublishedByBobId(productId);
    if (!product) {
      throw new NotFoundException('Bad Request!!');
    }
    const imageByKey = await this.signImages([product]);
    return mapBobProductDetail(product, imageByKey, this.storefrontUrl());
  }

  async listProducts(query: BobListProductsQueryDto = {}): Promise<BobProductList> {
    const started = Date.now();
    const ids = (query.ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const search = (query.search ?? query.q)?.trim() || undefined;
    const paged = query.page != null || query.limit != null || Boolean(search);
    const page = query.page ?? 1;
    const limit = query.limit ?? (paged ? DEFAULT_SEARCH_PAGE_SIZE : undefined);

    let total = 0;
    let products: ProductEntity[];
    if (ids.length) {
      products = await this.bobProductResolver.findPublishedByBobIds(ids);
    } else {
      const catalog = await this.productsRepository.findPublishedRefIdsForBobCatalog({
        search,
        page: paged ? page : undefined,
        limit,
      });
      total = catalog.total;
      products = this.onlyCatalogueProducts(
        await this.loadPublishedByRefIds(catalog.refIds),
        'GET /products',
      );
    }

    const imageByKey = await this.signImages(products);
    const storefront = this.storefrontUrl();
    const details = products.map((product) => mapBobProductDetail(product, imageByKey, storefront));
    if (ids.length) {
      total = details.length;
    }
    const list = toBobProductList({
      products: details,
      total,
      page: paged && !ids.length ? page : 1,
      limit: paged && !ids.length ? (limit ?? DEFAULT_SEARCH_PAGE_SIZE) : total,
    });
    this.logger.log(
      {
        count: details.length,
        total: list.total,
        totalPages: list.totalPages,
        ids: ids.length,
        search: search ?? null,
        page: list.page,
        limit: list.limit,
        ms: Date.now() - started,
      },
      '[BOB inbound] GET /products',
    );
    return list;
  }

  async getVariant(variantId: string): Promise<BobVariantDetail> {
    const variant = await this.bobProductResolver.findActiveVariantByBobId(variantId);
    if (!variant || variant.status !== VariantStatus.ACTIVE || variant.deletedAt) {
      throw new NotFoundException('Bad Request!!');
    }
    const product = await this.productsRepository.findPublishedById(variant.productId);
    if (!product || !bobCatalogueProductId(product)) {
      throw new NotFoundException('Bad Request!!');
    }
    const imageByKey = await this.signImages([product]);
    return mapBobVariantDetail(variant, product, imageByKey);
  }

  private async resolveCategory(categoryId: string) {
    const key = categoryId.trim();
    const category = isUuid(key)
      ? await this.categoriesRepository.findById(key)
      : /^\d+$/.test(key)
        ? await this.categoriesRepository.findActiveByHierarchyId(Number(key))
        : await this.categoriesRepository.findByRefId(key);
    if (!category) {
      throw new NotFoundException('Bad Request!!');
    }
    return category;
  }

  async updateTags(productId: string, tags: string[]): Promise<BobProductSummary> {
    const id = await this.bobProductResolver.findIdByBobIdentifier(productId);
    if (!id) {
      throw new NotFoundException('Bad Request!!');
    }
    await this.productsService.replaceTags(id, tags, 'bob');
    const product = await this.productsRepository.findWithTagsById(id);
    if (!product) {
      throw new NotFoundException('Bad Request!!');
    }
    return mapBobProductSummary(product);
  }

  /**
  * BOB requires a numeric safe-integer externalProductId. Omit products that
  * cannot be represented instead of returning a null, generated, or invalid id.
   */
  private onlyCatalogueProducts(products: ProductEntity[], context: string): ProductEntity[] {
    const ready: ProductEntity[] = [];
    const skipped: string[] = [];
    for (const product of products) {
      if (bobCatalogueProductId(product)) {
        ready.push(product);
      } else {
        skipped.push(product.refId);
      }
    }
    if (skipped.length) {
      this.logger.warn(
        { context, refIds: skipped },
        '[BOB catalog] omitted products without a valid numeric externalProductId',
      );
    }
    return ready;
  }

  /**
   * Catalogue rows only need variants, media, tags, and category slugs.
   * findPublishedByRefIds loads those. The PDP relation load (faqs, bundles,
   * health concerns) is what made an unfiltered catalogue call exceed
   * Cloudflare's gateway time.
   */
  private async loadPublishedByRefIds(refIds: string[]): Promise<ProductEntity[]> {
    const chunks: string[][] = [];
    for (let index = 0; index < refIds.length; index += PRODUCT_PAGE_SIZE) {
      chunks.push(refIds.slice(index, index + PRODUCT_PAGE_SIZE));
    }

    const products: ProductEntity[] = [];
    for (let index = 0; index < chunks.length; index += PRODUCT_LOAD_CONCURRENCY) {
      const batch = chunks.slice(index, index + PRODUCT_LOAD_CONCURRENCY);
      const loaded = await Promise.all(
        batch.map((chunk) => this.productsRepository.findPublishedByRefIds(chunk)),
      );
      for (const rows of loaded) {
        products.push(...rows);
      }
    }
    this.logger.log({ count: products.length }, '[BOB catalog] products loaded');
    return products;
  }

  private async signImages(products: ProductEntity[]): Promise<Map<string, string>> {
    const refs = products.flatMap(collectImageRefs);
    const unique = [...new Map(refs.map((ref) => [ref.key, ref])).values()];
    const signed = await this.storageService.toFileReferenceResponses(unique);
    const imageByKey = new Map<string, string>();
    unique.forEach((ref, index) => {
      const url = signed[index]?.url;
      if (url) {
        imageByKey.set(ref.key, url);
      }
    });
    return imageByKey;
  }

  private storefrontUrl(): string {
    return this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '') ?? '';
  }
}

function toBobProductList(input: {
  products: BobProductDetail[];
  total: number;
  page: number;
  limit: number;
}): BobProductList {
  const page = Math.max(input.page, 1);
  const limit = Math.max(input.limit, 0);
  const total = Math.max(input.total, 0);
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    products: input.products,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}
