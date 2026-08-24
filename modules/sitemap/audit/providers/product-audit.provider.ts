import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { SitemapQueryService } from '../../services/sitemap-query.service';
import {
  absoluteSitemapUrl,
  buildProductLocPath,
} from '../../services/sitemap-url.builder';
import {
  AuditColumn,
  AuditFilters,
  AuditRecord,
  SitemapAuditProvider,
  UrlCheckResult,
} from '../sitemap-audit.types';
import { applyRecordFilters, formatIso } from './provider.utils';

type ProductAuditRaw = {
  id: string;
  refId: string;
  name: string;
  slug: string | null;
  status: string;
  deletedAt: Date | string | null;
  updatedAt: Date | string;
  categoryId: string | null;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  singleProductUrl: string | null;
  productPageUrl: string | null;
  hasActiveVariant: boolean | string | number;
};

@Injectable()
export class ProductAuditProvider implements SitemapAuditProvider {
  readonly type = 'products' as const;

  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
    private readonly queryService: SitemapQueryService,
    private readonly configService: ConfigService,
  ) {}

  columns(): AuditColumn[] {
    return [
      { key: 'name', header: 'Name' },
      { key: 'refId', header: 'Ref ID' },
      { key: 'slug', header: 'Slug' },
      { key: 'url', header: 'URL' },
      { key: 'locPath', header: 'Loc Path' },
      { key: 'status', header: 'Status' },
      { key: 'hasActiveVariant', header: 'Has Active Variant' },
      { key: 'deletedAt', header: 'Deleted At' },
      { key: 'updatedAt', header: 'Updated At' },
      { key: 'sitemapEligible', header: 'Sitemap Eligible' },
      { key: 'exclusionReason', header: 'Exclusion Reason' },
    ];
  }

  private baseUrl(): string {
    return (this.configService.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
  }

  private truthy(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1' || value === 't';
  }

  async fetchAll(filters: AuditFilters): Promise<AuditRecord[]> {
    const baseUrl = this.baseUrl();
    const nodes = await this.queryService.loadCategoryNodes();
    const batchSize = this.configService.get<number>('sitemap.batchSize') ?? 10_000;
    const records: AuditRecord[] = [];
    let lastId = '';

    while (true) {
      const qb = this.productsRepo
        .createQueryBuilder('product')
        .withDeleted()
        .select('product.id', 'id')
        .addSelect('product.ref_id', 'refId')
        .addSelect('product.name', 'name')
        .addSelect('product.slug', 'slug')
        .addSelect('product.status', 'status')
        .addSelect('product.deleted_at', 'deletedAt')
        .addSelect('product.updated_at', 'updatedAt')
        .addSelect('product.category_id', 'categoryId')
        .addSelect('product.sub_category_id', 'subCategoryId')
        .addSelect('product.sub_sub_category_id', 'subSubCategoryId')
        .addSelect('product.sub_sub_sub_category_id', 'subSubSubCategoryId')
        .addSelect('product.single_product_url', 'singleProductUrl')
        .addSelect(
          `(SELECT pv.product_page_url FROM product_variants pv
            WHERE pv.product_id = product.id
              AND pv.deleted_at IS NULL
              AND pv.status = :variantStatus
              AND pv.product_page_url IS NOT NULL
              AND btrim(pv.product_page_url) <> ''
            ORDER BY pv.product_page_url
            LIMIT 1)`,
          'productPageUrl',
        )
        .addSelect(
          `EXISTS (
            SELECT 1 FROM product_variants pv
            WHERE pv.product_id = product.id
              AND pv.deleted_at IS NULL
              AND pv.status = :variantStatus
          )`,
          'hasActiveVariant',
        )
        .setParameter('variantStatus', VariantStatus.ACTIVE)
        .orderBy('product.id', 'ASC')
        .take(batchSize);

      if (lastId) qb.andWhere('product.id > :lastId', { lastId });

      const rows = await qb.getRawMany<ProductAuditRaw>();
      if (!rows.length) break;

      for (const row of rows) {
        lastId = row.id;
        const deleted = Boolean(row.deletedAt);
        const hasActiveVariant = this.truthy(row.hasActiveVariant);
        const deepestCategoryId =
          row.subSubSubCategoryId || row.subSubCategoryId || row.subCategoryId || row.categoryId;
        const locPath = buildProductLocPath({
          slug: row.slug,
          productPageUrl: row.productPageUrl,
          singleProductUrl: row.singleProductUrl,
          categorySlugPath: this.queryService.categorySlugPath(nodes, deepestCategoryId),
        });
        const published = row.status === ProductStatus.PUBLISHED;
        const eligible = !deleted && published && hasActiveVariant && Boolean(locPath);

        let exclusionReason: string | null = null;
        if (deleted) exclusionReason = 'Soft-deleted';
        else if (!published) exclusionReason = `Status is ${row.status}`;
        else if (!hasActiveVariant) exclusionReason = 'No active non-deleted variant';
        else if (!locPath) exclusionReason = 'Could not build product URL';

        records.push({
          name: row.name,
          refId: row.refId,
          slug: row.slug,
          locPath,
          url: locPath && baseUrl ? absoluteSitemapUrl(baseUrl, locPath) : null,
          status: row.status,
          hasActiveVariant: hasActiveVariant ? 'YES' : 'NO',
          deletedAt: formatIso(row.deletedAt),
          updatedAt: formatIso(row.updatedAt),
          sitemapEligible: eligible,
          exclusionReason: eligible ? null : exclusionReason,
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
      (row) => (String(row.locPath ?? '').replace(/\/+$/, '') || '/') === normalized,
    );
    if (!match) {
      return { found: false, sitemapType: this.type, url: absoluteSitemapUrl(baseUrl, pathname), locPath: pathname };
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
