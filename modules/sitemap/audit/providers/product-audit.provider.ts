import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { SitemapQueryService } from '../../services/sitemap-query.service';
import {
  absoluteSitemapUrl,
  buildProductLocPath,
  resolveProductSitemapLoc,
} from '../../services/sitemap-url.builder';
import {
  AuditColumn,
  AuditFilters,
  AuditRecord,
  SitemapAuditProvider,
  UrlCheckResult,
} from '../sitemap-audit.types';
import { applyRecordFilters, formatIso } from './provider.utils';

type ProductVariantAuditRaw = {
  variantId: string;
  sku: string | null;
  variantSlug: string | null;
  variantStatus: string;
  variantDeletedAt: Date | string | null;
  productPageUrl: string | null;
  variantUpdatedAt: Date | string | null;
  productId: string;
  refId: string;
  productName: string;
  productSlug: string | null;
  productStatus: string;
  productDeletedAt: Date | string | null;
  productUpdatedAt: Date | string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  singleProductUrl: string | null;
};

@Injectable()
export class ProductAuditProvider implements SitemapAuditProvider {
  readonly type = 'products' as const;

  constructor(
    @InjectRepository(ProductVariantEntity)
    private readonly variantsRepo: Repository<ProductVariantEntity>,
    private readonly queryService: SitemapQueryService,
    private readonly configService: ConfigService,
  ) {}

  columns(): AuditColumn[] {
    return [
      { key: 'refId', header: 'Product Ref ID' },
      { key: 'name', header: 'Product Name' },
      { key: 'productSlug', header: 'Product Slug' },
      { key: 'variantId', header: 'Variant ID' },
      { key: 'sku', header: 'SKU' },
      { key: 'slug', header: 'Variant Slug' },
      { key: 'productPageUrl', header: 'Product Page URL' },
      { key: 'generatedDynamicUrl', header: 'Generated Dynamic URL' },
      { key: 'url', header: 'Final Sitemap URL' },
      { key: 'locPath', header: 'Loc Path' },
      { key: 'urlSource', header: 'URL Source' },
      { key: 'status', header: 'Product Status' },
      { key: 'variantStatus', header: 'Variant Status' },
      { key: 'deletedAt', header: 'Product Deleted At' },
      { key: 'variantDeletedAt', header: 'Variant Deleted At' },
      { key: 'updatedAt', header: 'Updated At' },
      { key: 'sitemapEligible', header: 'Sitemap Eligible' },
      { key: 'exclusionReason', header: 'Exclusion Reason' },
    ];
  }

  private baseUrl(): string {
    return (this.configService.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
  }

  async fetchAll(filters: AuditFilters): Promise<AuditRecord[]> {
    const baseUrl = this.baseUrl();
    const nodes = await this.queryService.loadCategoryNodes();
    const batchSize = this.configService.get<number>('sitemap.batchSize') ?? 10_000;
    const records: AuditRecord[] = [];
    /** Tracks final locPaths already counted as sitemap-eligible (mirrors generation dedupe). */
    const seenEligibleLocs = new Set<string>();
    let lastVariantId = '';

    while (true) {
      const qb = this.variantsRepo
        .createQueryBuilder('variant')
        .withDeleted()
        .innerJoin(ProductEntity, 'product', 'product.id = variant.product_id')
        .select('variant.id', 'variantId')
        .addSelect('variant.sku', 'sku')
        .addSelect('variant.slug', 'variantSlug')
        .addSelect('variant.status', 'variantStatus')
        .addSelect('variant.deleted_at', 'variantDeletedAt')
        .addSelect('variant.product_page_url', 'productPageUrl')
        .addSelect('variant.updated_at', 'variantUpdatedAt')
        .addSelect('product.id', 'productId')
        .addSelect('product.ref_id', 'refId')
        .addSelect('product.name', 'productName')
        .addSelect('product.slug', 'productSlug')
        .addSelect('product.status', 'productStatus')
        .addSelect('product.deleted_at', 'productDeletedAt')
        .addSelect('product.updated_at', 'productUpdatedAt')
        .addSelect('product.category_id', 'categoryId')
        .addSelect('product.sub_category_id', 'subCategoryId')
        .addSelect('product.sub_sub_category_id', 'subSubCategoryId')
        .addSelect('product.sub_sub_sub_category_id', 'subSubSubCategoryId')
        .addSelect('product.single_product_url', 'singleProductUrl')
        .orderBy('variant.id', 'ASC')
        .take(batchSize);

      if (lastVariantId) qb.andWhere('variant.id > :lastVariantId', { lastVariantId });

      const rows = await qb.getRawMany<ProductVariantAuditRaw>();
      if (!rows.length) break;

      for (const row of rows) {
        lastVariantId = row.variantId;
        const productDeleted = Boolean(row.productDeletedAt);
        const variantDeleted = Boolean(row.variantDeletedAt);
        const published = row.productStatus === ProductStatus.PUBLISHED;
        const variantActive = row.variantStatus === VariantStatus.ACTIVE;
        const deepestCategoryId =
          row.subSubSubCategoryId || row.subSubCategoryId || row.subCategoryId || row.categoryId;
        const categorySlugPath = this.queryService.categorySlugPath(nodes, deepestCategoryId);

        const dynamicLocPath = buildProductLocPath({
          slug: row.productSlug,
          productPageUrl: null,
          singleProductUrl: row.singleProductUrl,
          categorySlugPath,
        });
        const resolved = resolveProductSitemapLoc({
          slug: row.productSlug,
          productPageUrl: row.productPageUrl,
          singleProductUrl: row.singleProductUrl,
          categorySlugPath,
        });

        let exclusionReason: string | null = null;
        if (productDeleted) exclusionReason = 'Soft-deleted product';
        else if (variantDeleted) exclusionReason = 'Soft-deleted variant';
        else if (!published) exclusionReason = `Product status is ${row.productStatus}`;
        else if (!variantActive) exclusionReason = `Variant status is ${row.variantStatus}`;
        else if (!resolved) exclusionReason = 'Could not build product URL';

        const baseEligible =
          !productDeleted && !variantDeleted && published && variantActive && Boolean(resolved);

        let sitemapEligible = baseEligible;
        if (baseEligible && resolved) {
          if (seenEligibleLocs.has(resolved.locPath)) {
            sitemapEligible = false;
            exclusionReason = 'Duplicate final sitemap URL';
          } else {
            seenEligibleLocs.add(resolved.locPath);
          }
        }

        const locPath = resolved?.locPath ?? null;
        records.push({
          refId: row.refId,
          name: row.productName,
          productSlug: row.productSlug,
          variantId: row.variantId,
          sku: row.sku,
          slug: row.variantSlug,
          productPageUrl: row.productPageUrl,
          generatedDynamicUrl:
            dynamicLocPath && baseUrl ? absoluteSitemapUrl(baseUrl, dynamicLocPath) : dynamicLocPath,
          locPath,
          url: locPath && baseUrl ? absoluteSitemapUrl(baseUrl, locPath) : null,
          urlSource: resolved?.source ?? null,
          status: row.productStatus,
          variantStatus: row.variantStatus,
          deletedAt: formatIso(row.productDeletedAt),
          variantDeletedAt: formatIso(row.variantDeletedAt),
          updatedAt: formatIso(row.variantUpdatedAt ?? row.productUpdatedAt),
          sitemapEligible,
          exclusionReason: sitemapEligible ? null : exclusionReason,
        });
      }

      if (rows.length < batchSize) break;
    }

    return applyRecordFilters(records, filters);
  }

  async matchPath(pathname: string, baseUrl: string): Promise<UrlCheckResult | null> {
    if (!pathname.startsWith('/shop/') && pathname !== '/shop') return null;
    const normalized = pathname.replace(/\/+$/, '') || '/';
    const records = await this.fetchAll({});
    const match = records.find(
      (row) =>
        row.sitemapEligible &&
        (String(row.locPath ?? '').replace(/\/+$/, '') || '/') === normalized,
    );
    if (!match) {
      return {
        found: false,
        sitemapType: this.type,
        url: absoluteSitemapUrl(baseUrl, pathname),
        locPath: pathname,
      };
    }
    return {
      found: true,
      sitemapType: this.type,
      refId: match.refId,
      name: match.name,
      slug: match.slug,
      status: match.status,
      deletedAt: match.deletedAt,
      sitemapEligible: match.sitemapEligible,
      exclusionReason: match.exclusionReason,
      url: match.url ?? absoluteSitemapUrl(baseUrl, pathname),
      locPath: match.locPath,
    };
  }
}
