import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductVariantsRepository } from '@modules/product/repositories/product-variants.repository';
import { ProductsService } from '@modules/product/services/products.service';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { StorageService } from '@packages/storage';
import { isUuid } from '../utils/bob.util';
import {
  collectImageRefs,
  mapBobCategory,
  mapBobProductDetail,
  mapBobProductSummary,
  mapBobVariantDetail,
} from '../mappers/bob.mapper';
import {
  BobCategory,
  BobProductDetail,
  BobProductSummary,
  BobVariantDetail,
} from '../interfaces/bob.interface';

const PRODUCT_PAGE_SIZE = 40;

@Injectable()
export class BobCatalogService {
  private readonly logger = new Logger(BobCatalogService.name);

  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly productVariantsRepository: ProductVariantsRepository,
    private readonly productsService: ProductsService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async listCategories(): Promise<BobCategory[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    this.logger.log({ count: categories.length }, '[BOB inbound] GET /categories');
    return categories.map(mapBobCategory);
  }

  async listProductsByCategory(categoryId: string): Promise<BobProductSummary[]> {
    const category = isUuid(categoryId)
      ? await this.categoriesRepository.findById(categoryId)
      : await this.categoriesRepository.findByRefId(categoryId);
    if (!category) {
      throw new NotFoundException('Bad Request!!');
    }
    const refIds = await this.productsRepository.findPublishedRefIdsByCategoryId(category.id);
    const products = await this.loadPublishedByRefIds(refIds);
    return products.map(mapBobProductSummary);
  }

  async getProduct(productId: string): Promise<BobProductDetail> {
    const product = await this.resolvePublishedProduct(productId);
    if (!product) {
      throw new NotFoundException('Bad Request!!');
    }
    const imageByKey = await this.signImages([product]);
    return mapBobProductDetail(product, imageByKey, this.storefrontUrl());
  }

  async listProducts(idsParam?: string): Promise<BobProductDetail[]> {
    const ids = (idsParam ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    let products: ProductEntity[] = [];
    if (ids.length) {
      const unique = [...new Set(ids)];
      const byUuid = unique.filter(isUuid);
      const byRef = unique.filter((id) => !isUuid(id));
      const loaded = [
        ...(byUuid.length ? await this.productsRepository.findPublishedByIds(byUuid) : []),
        ...(byRef.length ? await this.loadPublishedByRefIds(byRef) : []),
      ];
      const byId = new Map(loaded.map((product) => [product.id, product]));
      const byRefId = new Map(loaded.map((product) => [product.refId, product]));
      products = unique
        .map((id) => byId.get(id) ?? byRefId.get(id))
        .filter((product): product is ProductEntity => Boolean(product));
    } else {
      const allRefIds = await this.productsRepository.findAllPublishedRefIds();
      products = await this.loadPublishedByRefIds(allRefIds);
    }

    const imageByKey = await this.signImages(products);
    const storefront = this.storefrontUrl();
    return products.map((product) => mapBobProductDetail(product, imageByKey, storefront));
  }

  async getVariant(variantId: string): Promise<BobVariantDetail> {
    const variant = await this.productVariantsRepository.findById(variantId);
    if (!variant || variant.status !== VariantStatus.ACTIVE || variant.deletedAt) {
      throw new NotFoundException('Bad Request!!');
    }
    const product = await this.productsRepository.findPublishedById(variant.productId);
    if (!product) {
      throw new NotFoundException('Bad Request!!');
    }
    const imageByKey = await this.signImages([product]);
    return mapBobVariantDetail(variant, product, imageByKey);
  }

  async updateTags(productId: string, tags: string[]): Promise<BobProductSummary> {
    const id = await this.productsRepository.findIdByUuidOrRefId(productId);
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

  private async resolvePublishedProduct(productId: string): Promise<ProductEntity | null> {
    if (isUuid(productId)) {
      return this.productsRepository.findPublishedById(productId);
    }
    const [product] = await this.loadPublishedByRefIds([productId]);
    return product ?? null;
  }

  private async loadPublishedByRefIds(refIds: string[]): Promise<ProductEntity[]> {
    const products: ProductEntity[] = [];
    for (let index = 0; index < refIds.length; index += PRODUCT_PAGE_SIZE) {
      const chunk = refIds.slice(index, index + PRODUCT_PAGE_SIZE);
      const listed = await this.productsRepository.findPublishedByRefIds(chunk);
      const detailed = await this.productsRepository.findPublishedByIds(
        listed.map((product) => product.id),
      );
      const byId = new Map(detailed.map((product) => [product.id, product]));
      products.push(
        ...listed
          .map((product) => byId.get(product.id))
          .filter((product): product is ProductEntity => Boolean(product)),
      );
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
