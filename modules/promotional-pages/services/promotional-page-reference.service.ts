import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BlogPostEntity } from '@modules/master/entities/blog-post.entity';
import { BlogPostStatus } from '@modules/master/enums/blog-post-status.enum';
import { BlogPostVisibility } from '@modules/master/enums/blog-post-visibility.enum';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { mapCategoryEntitiesToPublicListItems } from '@modules/public/mappers/public-category.mapper';
import { mapProductEntitiesToPublicStorefrontCards } from '@modules/public/mappers/public-product.mapper';
import { IPublicCategoryListItem } from '@modules/public/interfaces/public-master.interface';
import { IPublicStorefrontProductCard } from '@modules/public/interfaces/public-product.interface';
import { buildBlogLocPath, buildBrandLocPath } from '@modules/sitemap/services/sitemap-url.builder';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';
import { PromotionalPageSectionEntity } from '../entities/promotional-page-section.entity';
import { PromotionalPageTargetEntity } from '../entities/promotional-page-target.entity';
import {
  IPublicBlogCard,
  IPublicBrandCard,
  IPublicPromotionalSection,
  IPublicPromotionalTargets,
} from '../interfaces/promotional-page.interface';
import { CatalogRefSets, DEFAULT_COLLECTION_LIMIT, compareSortOrder } from '../utils/promotional-page-content.util';

@Injectable()
export class PromotionalPageReferenceService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRows: Repository<ProductEntity>,
    @InjectRepository(BlogPostEntity)
    private readonly blogRows: Repository<BlogPostEntity>,
    private readonly productsRepository: ProductsRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly couponsRepository: CouponsRepository,
  ) {}

  async assertCatalogRefs(refs: CatalogRefSets): Promise<{ couponId: string | null }> {
    await this.assertExist(
      refs.productRefIds,
      await this.existingRefIds(this.productRows, refs.productRefIds),
      'product',
    );
    await this.assertExist(
      refs.categoryRefIds,
      new Set((await this.categoriesRepository.findByRefIds(refs.categoryRefIds)).map((row) => row.refId)),
      'category',
    );
    await this.assertExist(
      refs.brandRefIds,
      new Set((await this.brandsRepository.findByRefIds(refs.brandRefIds)).map((row) => row.refId)),
      'brand',
    );
    await this.assertExist(
      refs.blogRefIds,
      await this.existingRefIds(this.blogRows, refs.blogRefIds),
      'blog',
    );

    if (!refs.couponRefId) return { couponId: null };
    const coupon = await this.couponsRepository.findByRefId(refs.couponRefId);
    if (!coupon) {
      throw new BadRequestException(`Invalid promotion reference: ${refs.couponRefId}`);
    }
    return { couponId: coupon.id };
  }

  async hydrate(input: {
    sections: PromotionalPageSectionEntity[];
    targets: PromotionalPageTargetEntity[];
    coupon: CouponEntity | null | undefined;
  }): Promise<{ sections: IPublicPromotionalSection[]; targets: IPublicPromotionalTargets }> {
    const sections = [...input.sections].sort(compareSortOrder);
    const targets = [...input.targets].sort((a, b) => a.sortOrder - b.sortOrder);

    const manualProductIds = unique([
      ...sections.flatMap((section) =>
        (section.items ?? [])
          .filter((item) => item.targetType === PromotionalTargetType.PRODUCT)
          .map((item) => item.targetRefId),
      ),
      ...targets
        .filter((target) => target.targetType === PromotionalTargetType.PRODUCT)
        .map((target) => target.targetRefId),
    ]);
    const categoryIds = unique([
      ...sections.flatMap((section) =>
        (section.items ?? [])
          .filter((item) => item.targetType === PromotionalTargetType.CATEGORY)
          .map((item) => item.targetRefId),
      ),
      ...targets
        .filter((target) => target.targetType === PromotionalTargetType.CATEGORY)
        .map((target) => target.targetRefId),
    ]);
    const brandIds = unique([
      ...sections.flatMap((section) =>
        (section.items ?? [])
          .filter((item) => item.targetType === PromotionalTargetType.BRAND)
          .map((item) => item.targetRefId),
      ),
      ...sections.flatMap((section) =>
        section.config?.brandRefId ? [section.config.brandRefId] : [],
      ),
      ...targets
        .filter((target) => target.targetType === PromotionalTargetType.BRAND)
        .map((target) => target.targetRefId),
    ]);
    const selectedBlogIds = unique(
      sections.flatMap((section) =>
        (section.items ?? [])
          .filter((item) => item.targetType === PromotionalTargetType.BLOG)
          .map((item) => item.targetRefId),
      ),
    );

    const [productCards, categories, brands, blogs] = await Promise.all([
      this.loadProductCards(manualProductIds),
      this.loadCategories(categoryIds),
      this.loadBrands(brandIds),
      this.loadBlogs(selectedBlogIds),
    ]);

    const publicSections: IPublicPromotionalSection[] = [];
    for (const section of sections) {
      publicSections.push(
        await this.hydrateSection(section, { productCards, categories, brands, blogs }),
      );
    }

    return {
      sections: publicSections,
      targets: {
        products: targets
          .filter((target) => target.targetType === PromotionalTargetType.PRODUCT)
          .map((target) => productCards.get(target.targetRefId))
          .filter((card): card is IPublicStorefrontProductCard => Boolean(card)),
        categories: orderByRef(
          targets
            .filter((target) => target.targetType === PromotionalTargetType.CATEGORY)
            .map((target) => target.targetRefId),
          categories,
          (category) => category.refId,
        ),
        brands: orderByRef(
          targets
            .filter((target) => target.targetType === PromotionalTargetType.BRAND)
            .map((target) => target.targetRefId),
          brands,
          (brand) => brand.refId,
        ),
      },
    };
  }

  private async hydrateSection(
    section: PromotionalPageSectionEntity,
    catalogs: {
      productCards: Map<string, IPublicStorefrontProductCard>;
      categories: IPublicCategoryListItem[];
      brands: IPublicBrandCard[];
      blogs: IPublicBlogCard[];
    },
  ): Promise<IPublicPromotionalSection> {
    const items = [...(section.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    let products: IPublicStorefrontProductCard[] = [];
    let categories: IPublicCategoryListItem[] = [];
    let brands: IPublicBrandCard[] = [];
    let blogs: IPublicBlogCard[] = [];

    if (section.type === PromotionalSectionType.PRODUCT_COLLECTION) {
      const mode = section.config?.selectionMode ?? 'manual';
      const limit = section.config?.maxItems ?? DEFAULT_COLLECTION_LIMIT;
      const hideOutOfStock = section.config?.hideOutOfStock === true;
      if (mode === 'manual') {
        products = items
          .map((item) => catalogs.productCards.get(item.targetRefId))
          .filter((card): card is IPublicStorefrontProductCard => Boolean(card))
          .filter((card) => !hideOutOfStock || !card.outOfStock)
          .slice(0, limit);
      } else if (mode === 'brand' && section.config?.brandRefId) {
        products = await this.loadProductsForBrand(section.config.brandRefId, limit, hideOutOfStock);
      } else if (mode === 'category' && section.config?.categoryRefId) {
        products = await this.loadProductsForCategory(
          section.config.categoryRefId,
          limit,
          hideOutOfStock,
        );
      }
    }

    if (section.type === PromotionalSectionType.CATEGORY) {
      categories = orderByRef(
        items.map((item) => item.targetRefId),
        catalogs.categories,
        (category) => category.refId,
      );
    }

    if (section.type === PromotionalSectionType.BRAND) {
      brands = orderByRef(
        items.map((item) => item.targetRefId),
        catalogs.brands,
        (brand) => brand.refId,
      );
    }

    if (section.type === PromotionalSectionType.BLOG) {
      const mode = section.config?.blogMode ?? 'selected';
      if (mode === 'featured') {
        blogs = await this.loadBlogMode('featured');
      } else if (mode === 'trending') {
        blogs = await this.loadBlogMode('trending');
      } else {
        blogs = orderByRef(
          items.map((item) => item.targetRefId),
          catalogs.blogs,
          (blog) => blog.refId,
        );
      }
    }

    return {
      id: section.id,
      type: section.type,
      title: section.title,
      subtitle: section.subtitle,
      config: section.config ?? {},
      sortOrder: section.sortOrder,
      isActive: section.isActive,
      isCurrentlyVisible: true,
      startAt: section.startAt,
      endAt: section.endAt,
      products,
      categories,
      brands,
      blogs,
    };
  }

  private async loadProductCards(
    refIds: string[],
  ): Promise<Map<string, IPublicStorefrontProductCard>> {
    const cards = new Map<string, IPublicStorefrontProductCard>();
    if (!refIds.length) return cards;
    const products = await this.productsRepository.findPublishedByRefIds(refIds);
    const byRef = new Map(products.map((product) => [product.refId, product]));
    const ordered = refIds
      .map((refId) => byRef.get(refId))
      .filter((product): product is ProductEntity => Boolean(product));
    const mapped = mapProductEntitiesToPublicStorefrontCards(ordered);
    ordered.forEach((product, index) => {
      const card = mapped[index];
      if (card) cards.set(product.refId, card);
    });
    return cards;
  }

  private async loadProductsForBrand(
    brandRefId: string,
    limit: number,
    hideOutOfStock = false,
  ): Promise<IPublicStorefrontProductCard[]> {
    const brands = await this.brandsRepository.findByRefIds([brandRefId]);
    const brand = brands.find((row) => row.refId === brandRefId && row.status === MasterStatus.ACTIVE);
    if (!brand) return [];
    const { data } = await this.productsRepository.findPublishedPaginated({
      page: 1,
      limit,
      brandId: brand.id,
      ...(hideOutOfStock ? { inStockOnly: true } : {}),
    });
    return mapProductEntitiesToPublicStorefrontCards(data);
  }

  private async loadProductsForCategory(
    categoryRefId: string,
    limit: number,
    hideOutOfStock = false,
  ): Promise<IPublicStorefrontProductCard[]> {
    const categories = await this.categoriesRepository.findActiveByRefIds([categoryRefId]);
    const category = categories.find((row) => row.refId === categoryRefId);
    if (!category) return [];
    const { data } = await this.productsRepository.findPublishedPaginated({
      page: 1,
      limit,
      categoryId: category.id,
      ...(hideOutOfStock ? { inStockOnly: true } : {}),
    });
    return mapProductEntitiesToPublicStorefrontCards(data);
  }

  private async loadCategories(refIds: string[]): Promise<IPublicCategoryListItem[]> {
    if (!refIds.length) return [];
    const rows = await this.categoriesRepository.findActiveByRefIds(refIds);
    const byRef = new Map(rows.map((row) => [row.refId, row]));
    const ordered = refIds
      .map((refId) => byRef.get(refId))
      .filter((row): row is CategoryEntity => Boolean(row));
    return mapCategoryEntitiesToPublicListItems(ordered);
  }

  private async loadBrands(refIds: string[]): Promise<IPublicBrandCard[]> {
    if (!refIds.length) return [];
    const rows = await this.brandsRepository.findByRefIds(refIds);
    return rows
      .filter((row) => row.status === MasterStatus.ACTIVE)
      .sort((a, b) => refIds.indexOf(a.refId) - refIds.indexOf(b.refId))
      .map((row) => this.toBrandCard(row));
  }

  private async loadBlogs(refIds: string[]): Promise<IPublicBlogCard[]> {
    if (!refIds.length) return [];
    const rows = await this.blogRows.find({
      where: {
        refId: In(refIds),
        status: BlogPostStatus.PUBLISHED,
        visibility: BlogPostVisibility.PUBLIC,
      },
    });
    const byRef = new Map(rows.map((row) => [row.refId, row]));
    return refIds
      .map((refId) => byRef.get(refId))
      .filter((row): row is BlogPostEntity => Boolean(row))
      .map((row) => this.toBlogCard(row));
  }

  private async loadBlogMode(mode: 'featured' | 'trending'): Promise<IPublicBlogCard[]> {
    const rows = await this.blogRows.find({
      where: {
        status: BlogPostStatus.PUBLISHED,
        visibility: BlogPostVisibility.PUBLIC,
        ...(mode === 'featured' ? { isFeatured: true } : { isTrending: true }),
      },
      order: mode === 'featured' ? { publishedAt: 'DESC' } : { views: 'DESC', publishedAt: 'DESC' },
      take: DEFAULT_COLLECTION_LIMIT,
    });
    return rows.map((row) => this.toBlogCard(row));
  }

  private toBrandCard(brand: BrandEntity): IPublicBrandCard {
    return {
      refId: brand.refId,
      name: brand.name,
      slug: brand.slug,
      description: brand.description,
      logo: brand.logo,
      logoAltText: brand.logoAltText ?? null,
      permalink: buildBrandLocPath(brand.slug),
    };
  }

  private toBlogCard(blog: BlogPostEntity): IPublicBlogCard {
    return {
      refId: blog.refId,
      title: blog.title,
      slug: blog.slug,
      excerpt: blog.excerpt,
      featuredImage: blog.featuredImage,
      featuredImageAltText: blog.featuredImageAltText ?? null,
      permalink: buildBlogLocPath(blog.slug),
      isFeatured: blog.isFeatured,
      isTrending: blog.isTrending,
    };
  }

  private async existingRefIds(
    repo: Repository<{ refId: string }>,
    refIds: string[],
  ): Promise<Set<string>> {
    if (!refIds.length) return new Set();
    const rows = await repo.find({
      where: { refId: In(refIds) } as never,
    });
    return new Set(rows.map((row) => row.refId));
  }

  private async assertExist(expected: string[], found: Set<string>, label: string): Promise<void> {
    const missing = expected.filter((refId) => !found.has(refId));
    if (missing.length) {
      throw new BadRequestException(`Invalid ${label} reference(s): ${missing.join(', ')}`);
    }
  }
}

const unique = (values: string[]): string[] => [...new Set(values)];

const orderByRef = <T>(refIds: string[], rows: T[], refOf: (row: T) => string): T[] => {
  const byRef = new Map(rows.map((row) => [refOf(row), row]));
  return refIds.map((refId) => byRef.get(refId)).filter((row): row is T => Boolean(row));
};
