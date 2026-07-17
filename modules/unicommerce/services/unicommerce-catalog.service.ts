import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import {
  IUnicommerceCatalogProduct,
  IUnicommerceProductsCountResponse,
  IUnicommerceProductsResponse,
} from '../interfaces/unicommerce-catalog.interface';
import { mapProductToUnicommerceCatalog } from '../mappers/unicommerce-product.mapper';
import { UnicommerceProductsQueryDto } from '../dto/unicommerce-products-query.dto';

@Injectable()
export class UnicommerceCatalogService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly configService: ConfigService,
  ) {}

  /** Count of live (published + active variant) SKUs exposed to Unicommerce. */
  async getProductsCount(): Promise<IUnicommerceProductsCountResponse> {
    const count = await this.productsRepository.countPublishedActiveVariants();
    return { count };
  }

  /** Returns only live catalog items — published products with active variants, not draft/inactive. */
  async getProducts(query: UnicommerceProductsQueryDto): Promise<IUnicommerceProductsResponse> {
    const skus = query.skus
      ?.split(',')
      .map((sku) => sku.trim())
      .filter(Boolean);

    const products = await this.productsRepository.findPublishedProductsForUnicommerce({
      page: query.pageNumber,
      pageSize: query.pageSize,
      skus,
    });

    const imageUrlByMediaId = await this.buildImageUrlMap(products.flatMap((product) => product.media ?? []));
    const productBaseUrl = this.configService.get<string>('UNICOMMERCE_PRODUCT_BASE_URL') ?? undefined;

    const mappedProducts = products
      .map((product) =>
        mapProductToUnicommerceCatalog(product, {
          imageUrlByMediaId,
          productBaseUrl,
        }),
      )
      .filter((product): product is NonNullable<typeof product> => product !== null);

    return { products: mappedProducts };
  }

  async getPublishedProduct(refId: string): Promise<IUnicommerceCatalogProduct | null> {
    const product = await this.productsRepository.findPublishedByRefId(refId);
    if (!product?.publishedAt) {
      return null;
    }

    const imageUrlByMediaId = await this.buildImageUrlMap(product.media ?? []);
    const productBaseUrl = this.configService.get<string>('UNICOMMERCE_PRODUCT_BASE_URL') ?? undefined;
    return mapProductToUnicommerceCatalog(product, {
      imageUrlByMediaId,
      productBaseUrl,
    });
  }

  private async buildImageUrlMap(
    mediaItems: ProductMediaEntity[],
  ): Promise<Map<string, string | undefined>> {
    const map = new Map<string, string | undefined>();

    await Promise.all(
      mediaItems.map(async (media) => {
        const reference = await this.storageUrlEnricher.toReference(media.url);
        map.set(media.id, reference?.url);
      }),
    );

    return map;
  }
}
