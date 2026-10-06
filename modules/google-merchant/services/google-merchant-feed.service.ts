import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isVariantInStock } from '@packages/common';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  absoluteSitemapUrl,
  resolveProductSitemapLoc,
} from '@modules/sitemap/services/sitemap-url.builder';
import { GOOGLE_MERCHANT_FEED_BATCH_SIZE } from '../constants/google-merchant.constants';
import {
  IGoogleMerchantFeedBuildResult,
  IGoogleMerchantFeedItem,
} from '../interfaces/google-merchant-feed-item.interface';
import { resolveGoogleMerchantItemId } from '../utils/google-merchant-id.util';
import { buildPublicMediaAbsoluteUrl } from '../utils/google-merchant-media-key.util';
import {
  buildGoogleMerchantRssXml,
  formatInrPrice,
  stripHtmlToText,
} from '../utils/google-merchant-xml.util';
import { GoogleMerchantIdLookupService } from './google-merchant-id-lookup.service';

type CategoryNode = { id: string; slug: string; parentId: string | null };

type FeedVariantRow = {
  variantId: string;
  sku: string;
  displayName: string | null;
  description: string | null;
  externalProductId: string | null;
  gtinNumber: string | null;
  mrp: string;
  sellingPrice: string;
  stock: number;
  outOfStock: boolean;
  inCurekaInventory: boolean | null;
  productPageUrl: string | null;
  productId: string;
  productRefId: string;
  productName: string;
  productSlug: string | null;
  productDescription: string | null;
  singleProductUrl: string | null;
  brandName: string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
};

@Injectable()
export class GoogleMerchantFeedService {
  private readonly logger = new Logger(GoogleMerchantFeedService.name);

  constructor(
    @InjectRepository(ProductVariantEntity)
    private readonly variantsRepo: Repository<ProductVariantEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoriesRepo: Repository<CategoryEntity>,
    @InjectRepository(ProductMediaEntity)
    private readonly mediaRepo: Repository<ProductMediaEntity>,
    private readonly idLookup: GoogleMerchantIdLookupService,
    private readonly configService: ConfigService,
  ) {}

  getStorefrontBaseUrl(): string {
    const fromSitemap = this.configService.get<string>('sitemap.baseUrl')?.trim();
    const fromStorefront =
      this.configService.get<string>('STOREFRONT_URL')?.trim() ||
      process.env['STOREFRONT_URL']?.trim() ||
      process.env['SITEMAP_BASE_URL']?.trim();
    const base = (fromSitemap || fromStorefront || '').replace(/\/+$/, '');
    if (!base) {
      throw new Error('STOREFRONT_URL or SITEMAP_BASE_URL must be set for Google Merchant feed');
    }
    return base;
  }

  async buildXml(): Promise<{ xml: string; stats: IGoogleMerchantFeedBuildResult }> {
    const result = await this.buildItems();
    const baseUrl = this.getStorefrontBaseUrl();
    const xml = buildGoogleMerchantRssXml(result.items, {
      title: 'Cureka Google Merchant Feed',
      link: baseUrl,
      description: 'Cureka product feed for Google Merchant Center',
    });
    return { xml, stats: result };
  }

  async buildItems(): Promise<IGoogleMerchantFeedBuildResult> {
    const baseUrl = this.getStorefrontBaseUrl();
    const lookup = this.idLookup.getMap();
    const nodes = await this.loadCategoryNodes();

    const items: IGoogleMerchantFeedItem[] = [];
    let skippedMissingLink = 0;
    let skippedMissingImage = 0;
    let skippedMissingTitle = 0;
    let sheetIdHits = 0;
    let generatedIds = 0;
    let lastVariantId = '';

    while (true) {
      const rows = await this.fetchVariantBatch(lastVariantId);
      if (!rows.length) break;

      const mediaByProduct = await this.loadMediaKeysForProducts(
        rows.map((row) => row.productId),
      );

      for (const row of rows) {
        lastVariantId = row.variantId;

        const title = (row.displayName?.trim() || row.productName?.trim() || '').trim();
        if (!title) {
          skippedMissingTitle += 1;
          continue;
        }

        const deepestCategoryId =
          row.subSubSubCategoryId ||
          row.subSubCategoryId ||
          row.subCategoryId ||
          row.categoryId;
        const resolved = resolveProductSitemapLoc({
          slug: row.productSlug,
          productPageUrl: row.productPageUrl,
          singleProductUrl: row.singleProductUrl,
          categorySlugPath: this.categorySlugPath(nodes, deepestCategoryId),
        });
        if (!resolved?.locPath) {
          skippedMissingLink += 1;
          continue;
        }

        const imageKeys = this.pickImageKeys(
          mediaByProduct.get(row.productId) ?? [],
          row.variantId,
        );
        if (!imageKeys.length) {
          skippedMissingImage += 1;
          continue;
        }

        const idResult = resolveGoogleMerchantItemId({
          externalProductId: row.externalProductId,
          displayName: row.displayName,
          productName: row.productName,
          sku: row.sku,
          lookup,
        });
        if (idResult.source === 'sheet') sheetIdHits += 1;
        else generatedIds += 1;

        const selling = Number(row.sellingPrice) || 0;
        const mrp = Number(row.mrp) || 0;
        const outOfStock =
          row.outOfStock === true ||
          row.outOfStock === ('true' as unknown as boolean) ||
          row.outOfStock === (1 as unknown as boolean) ||
          String(row.outOfStock).toLowerCase() === 'true' ||
          String(row.outOfStock) === '1';
        const inStock =
          !outOfStock &&
          isVariantInStock(Number(row.stock), {
            inCurekaInventory: row.inCurekaInventory,
          });

        const description =
          stripHtmlToText(row.description) ||
          stripHtmlToText(row.productDescription) ||
          title;

        items.push({
          id: idResult.id,
          title,
          description,
          link: absoluteSitemapUrl(baseUrl, resolved.locPath),
          imageLink: buildPublicMediaAbsoluteUrl(baseUrl, imageKeys[0]!),
          additionalImageLinks: imageKeys
            .slice(1, 11)
            .map((key) => buildPublicMediaAbsoluteUrl(baseUrl, key)),
          availability: inStock ? 'in_stock' : 'out_of_stock',
          price: formatInrPrice(mrp > 0 ? mrp : selling),
          salePrice: mrp > 0 && selling > 0 && selling < mrp ? formatInrPrice(selling) : null,
          condition: 'new',
          brand: row.brandName?.trim() || 'Cureka',
          gtin: row.gtinNumber?.trim() || null,
          mpn: row.sku,
          itemGroupId: row.productRefId,
          sku: row.sku,
        });
      }

      if (rows.length < GOOGLE_MERCHANT_FEED_BATCH_SIZE) break;
    }

    this.logger.log(
      `Google Merchant feed built items=${items.length} sheetIds=${sheetIdHits} generatedIds=${generatedIds} skipLink=${skippedMissingLink} skipImage=${skippedMissingImage} skipTitle=${skippedMissingTitle}`,
    );

    return {
      items,
      itemCount: items.length,
      skippedMissingLink,
      skippedMissingImage,
      skippedMissingTitle,
      sheetIdHits,
      generatedIds,
    };
  }

  private async fetchVariantBatch(lastVariantId: string): Promise<FeedVariantRow[]> {
    const qb = this.variantsRepo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .leftJoin('product.brand', 'brand')
      .select('variant.id', 'variantId')
      .addSelect('variant.sku', 'sku')
      .addSelect('variant.display_name', 'displayName')
      .addSelect('variant.description', 'description')
      .addSelect('variant.external_product_id', 'externalProductId')
      .addSelect('variant.gtin_number', 'gtinNumber')
      .addSelect('variant.mrp', 'mrp')
      .addSelect('variant.selling_price', 'sellingPrice')
      .addSelect('variant.stock', 'stock')
      .addSelect('variant.out_of_stock', 'outOfStock')
      .addSelect('variant.in_cureka_inventory', 'inCurekaInventory')
      .addSelect('variant.product_page_url', 'productPageUrl')
      .addSelect('product.id', 'productId')
      .addSelect('product.ref_id', 'productRefId')
      .addSelect('product.name', 'productName')
      .addSelect('product.slug', 'productSlug')
      .addSelect('product.description', 'productDescription')
      .addSelect('product.single_product_url', 'singleProductUrl')
      .addSelect('brand.name', 'brandName')
      .addSelect('product.category_id', 'categoryId')
      .addSelect('product.sub_category_id', 'subCategoryId')
      .addSelect('product.sub_sub_category_id', 'subSubCategoryId')
      .addSelect('product.sub_sub_sub_category_id', 'subSubSubCategoryId')
      .where('product.status = :productStatus', { productStatus: ProductStatus.PUBLISHED })
      .andWhere('product.deleted_at IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('variant.deleted_at IS NULL')
      .orderBy('variant.id', 'ASC')
      .take(GOOGLE_MERCHANT_FEED_BATCH_SIZE);

    if (lastVariantId) {
      qb.andWhere('variant.id > :lastVariantId', { lastVariantId });
    }

    return qb.getRawMany<FeedVariantRow>();
  }

  private async loadCategoryNodes(): Promise<Map<string, CategoryNode>> {
    const rows = await this.categoriesRepo
      .createQueryBuilder('category')
      .select(['category.id', 'category.slug', 'category.parentCategoryId'])
      .getMany();

    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, slug: row.slug, parentId: row.parentCategoryId },
      ]),
    );
  }

  private categorySlugPath(
    nodes: Map<string, CategoryNode>,
    categoryId: string | null | undefined,
  ): string[] {
    if (!categoryId) return [];
    const slugs: string[] = [];
    const seen = new Set<string>();
    let current = nodes.get(categoryId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.slug?.trim()) slugs.unshift(current.slug.trim());
      current = current.parentId ? nodes.get(current.parentId) : undefined;
    }
    return slugs;
  }

  private async loadMediaKeysForProducts(
    productIds: string[],
  ): Promise<Map<string, Array<{ variantId: string | null; key: string; isPrimary: boolean; type: ProductMediaType; sortOrder: number }>>> {
    const unique = [...new Set(productIds.filter(Boolean))];
    const map = new Map<
      string,
      Array<{ variantId: string | null; key: string; isPrimary: boolean; type: ProductMediaType; sortOrder: number }>
    >();
    if (!unique.length) return map;

    const rows = await this.mediaRepo
      .createQueryBuilder('media')
      .select([
        'media.productId',
        'media.variantId',
        'media.url',
        'media.isPrimary',
        'media.type',
        'media.sortOrder',
      ])
      .where('media.productId IN (:...productIds)', { productIds: unique })
      .andWhere('media.type IN (:...types)', {
        types: [ProductMediaType.IMAGE, ProductMediaType.COMMON],
      })
      .orderBy('media.sortOrder', 'ASC')
      .getMany();

    for (const row of rows) {
      const key = row.url?.key?.trim();
      if (!key) continue;
      const list = map.get(row.productId) ?? [];
      list.push({
        variantId: row.variantId,
        key,
        isPrimary: row.isPrimary,
        type: row.type,
        sortOrder: row.sortOrder,
      });
      map.set(row.productId, list);
    }
    return map;
  }

  private pickImageKeys(
    media: Array<{
      variantId: string | null;
      key: string;
      isPrimary: boolean;
      type: ProductMediaType;
      sortOrder: number;
    }>,
    variantId: string,
  ): string[] {
    const variantMedia = media.filter(
      (item) => item.variantId === variantId && item.type !== ProductMediaType.COMMON,
    );
    const productMedia = media.filter(
      (item) =>
        !item.variantId &&
        (item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON),
    );

    const ordered = [
      ...variantMedia.sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
      ),
      ...productMedia.sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
      ),
    ];

    const seen = new Set<string>();
    const keys: string[] = [];
    for (const item of ordered) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      keys.push(item.key);
    }
    return keys;
  }
}
