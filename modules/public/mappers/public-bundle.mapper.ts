import { ProductEntity } from '@modules/product/entities/product.entity';
import {
  IPublicBundleBrand,
  IPublicBundleCard,
  IPublicBundleDetail,
} from '../interfaces/public-bundle.interface';
import {
  mapProductEntityToPublicCard,
  mapProductEntityToPublicDetail,
} from './public-product.mapper';

const mapBundleBrand = (entity: ProductEntity): IPublicBundleBrand | null => {
  if (!entity.brand) return null;
  return {
    refId: entity.brand.refId,
    name: entity.brand.name,
    slug: entity.brand.slug,
    logo: entity.brand.logo,
    description: entity.brand.description,
  };
};

export const mapProductEntityToPublicBundleCard = (entity: ProductEntity): IPublicBundleCard => {
  const card = mapProductEntityToPublicCard(entity);
  const variantId = card.variantId;

  return {
    id: entity.id,
    productId: entity.id,
    refId: entity.refId,
    name: card.name,
    slug: entity.slug,
    description: entity.description,
    bundleIcon: entity.bundleIcon ?? null,
    primaryImageUrl: card.primaryImageUrl,
    brand: mapBundleBrand(entity),
    curatedBy: entity.curatedBy ?? null,
    curatedFor: entity.curatedFor ?? null,
    pricing: card.pricing,
    outOfStock: card.outOfStock,
    publishedAt: entity.publishedAt,
    permalink: card.permalink,
    productPageUrl: card.productPageUrl,
    defaultVariantId: variantId,
    variantId,
  };
};

export const mapProductEntitiesToPublicBundleCards = (
  entities: ProductEntity[],
): IPublicBundleCard[] => entities.map(mapProductEntityToPublicBundleCard);

export const mapProductEntityToPublicBundleDetail = (
  entity: ProductEntity,
): IPublicBundleDetail => {
  const card = mapProductEntityToPublicBundleCard(entity);
  const detail = mapProductEntityToPublicDetail(entity);

  return {
    ...card,
    components: entity.components,
    categoryRefId: detail.categoryRefId,
    categoryName: detail.categoryName,
    categorySlugPath: detail.categorySlugPath,
    subscriptionEnabled: detail.subscriptionEnabled,
    codAvailable: detail.codAvailable,
    emiAvailable: detail.emiAvailable,
    metaTitle: detail.metaTitle,
    metaDescription: detail.metaDescription,
    metaKeywords: detail.metaKeywords,
    media: detail.media.map((item) => ({
      id: item.id,
      type: item.type,
      url: item.url,
      sortOrder: item.sortOrder,
      isPrimary: item.isPrimary,
    })),
    variants: detail.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      slug: variant.slug,
      mrp: variant.mrp,
      sellingPrice: variant.sellingPrice,
      discountPercentage: variant.discountPercentage,
      stock: variant.stock,
      inStock: variant.inStock,
      outOfStock: variant.outOfStock,
    })),
    bundleItems: detail.bundleItems,
    healthConcerns: detail.healthConcerns,
    wellnessGoals: detail.wellnessGoals,
    tags: detail.tags,
  };
};
