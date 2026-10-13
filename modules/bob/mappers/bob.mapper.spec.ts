import 'reflect-metadata';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { mapProductEntityToResponse } from '@modules/product/mappers/product.mapper';
import {
  mapBobCategory,
  mapBobOrder,
  mapBobProductDetail,
  mapBobProductSummary,
  mapBobVariantDetail,
} from './bob.mapper';

const PRODUCT_UUID = 'c4e9b094-30f1-4ca5-aaec-0e0b60631ab6';
const CATALOGUE_ID = '217301';
const VARIANT_UUID = '5a545f0f-f96c-44b5-bea5-88542d7796b6';

function catalogueProduct(): ProductEntity {
  return {
    id: PRODUCT_UUID,
    refId: 'LAC2026514080',
    externalProductId: CATALOGUE_ID,
    name: 'Lactisyn Sachets (10 x 1gm Sachet)',
    status: ProductStatus.PUBLISHED,
    description: 'Lactisyn Sachets (10 x 1gm Sachet)',
    slug: 'lactisyn-sachets-10x1gm-sachet',
    tagMappings: [],
    media: [],
    variants: [
      {
        id: VARIANT_UUID,
        status: VariantStatus.ACTIVE,
        sellingPrice: '532',
        stock: 3,
        attributeValues: [],
        inCurekaInventory: false,
      } as unknown as ProductVariantEntity,
    ],
  } as unknown as ProductEntity;
}

describe('mapBobCategory', () => {
  it('keeps BOB spec fields id + title and adds parent linkage', () => {
    const child = {
      id: 'child-uuid',
      hierarchyId: 220184,
      name: 'Medical Equipments',
      parentCategoryId: 'parent-uuid',
    } as CategoryEntity;

    expect(mapBobCategory(child, { hierarchyId: 1031, name: 'Healthcare Devices' })).toEqual({
      id: 220184,
      title: 'Medical Equipments',
      parentId: 1031,
      parentTitle: 'Healthcare Devices',
    });
  });

  it('returns null parent fields for root categories', () => {
    const root = {
      id: 'root-uuid',
      hierarchyId: 123456,
      name: 'Healthcare Devices',
      parentCategoryId: null,
    } as CategoryEntity;

    expect(mapBobCategory(root)).toEqual({
      id: 123456,
      title: 'Healthcare Devices',
      parentId: null,
      parentTitle: null,
    });
  });
});

describe('BOB catalogue product id', () => {
  it('uses externalProductId as the BOB product id and leaves the internal UUID on the entity', () => {
    const product = catalogueProduct();

    expect(mapBobProductSummary(product)).toEqual({
      id: 217301,
      title: 'Lactisyn Sachets (10 x 1gm Sachet)',
      status: 'ACTIVE',
      tags: [],
    });
    expect(product.id).toBe(PRODUCT_UUID);
  });

  it('keeps variant ids as internal UUIDs on the product detail', () => {
    const detail = mapBobProductDetail(catalogueProduct(), new Map(), '');

    expect(detail.id).toBe(217301);
    expect(detail.title).toBe('Lactisyn Sachets (10 x 1gm Sachet)');
    expect(detail.variants[0]?.id).toBe(VARIANT_UUID);
  });

  it('uses the catalogue id only for the nested product on a variant response', () => {
    const product = catalogueProduct();
    const variant = product.variants[0]!;
    const detail = mapBobVariantDetail(variant, product, new Map());

    expect(detail.id).toBe(VARIANT_UUID);
    expect(detail.product.id).toBe(217301);
  });

  it('reports website sellability without copying stored stock or the display quantity', () => {
    const previous = process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const cases: Array<{
      label: string;
      stock: number;
      inCurekaInventory: boolean;
      outOfStock?: boolean;
      bundleComponentOos?: boolean;
      quantity: number;
      policy: 'deny' | 'continue';
    }> = [
      {
        label: 'non-managed stored zero still for sale',
        stock: 0,
        inCurekaInventory: false,
        quantity: 1,
        policy: 'continue',
      },
      {
        label: 'non-managed negative stock still for sale',
        stock: -3,
        inCurekaInventory: false,
        quantity: 1,
        policy: 'continue',
      },
      {
        label: 'Cureka-managed positive stock',
        stock: 1,
        inCurekaInventory: true,
        quantity: 1,
        policy: 'deny',
      },
      {
        label: 'Cureka-managed zero stock',
        stock: 0,
        inCurekaInventory: true,
        quantity: 0,
        policy: 'deny',
      },
      {
        label: 'explicitly unavailable even when a display quantity would be 1',
        stock: 0,
        inCurekaInventory: false,
        outOfStock: true,
        quantity: 0,
        policy: 'continue',
      },
      {
        label: 'managed stock is hidden when the website marks the variant unavailable',
        stock: 5,
        inCurekaInventory: true,
        outOfStock: true,
        quantity: 0,
        policy: 'deny',
      },
    ];

    for (const item of cases) {
      const product = catalogueProduct();
      product.bundleComponentOos = item.bundleComponentOos ?? false;
      const variant = product.variants[0]!;
      variant.stock = item.stock;
      variant.inCurekaInventory = item.inCurekaInventory;
      variant.outOfStock = item.outOfStock ?? false;
      const detail = mapBobProductDetail(product, new Map(), '');
      expect({
        label: item.label,
        inventoryQuantity: detail.variants[0]?.inventoryQuantity,
        inventoryPolicy: detail.variants[0]?.inventoryPolicy,
      }).toEqual({
        label: item.label,
        inventoryQuantity: item.quantity,
        inventoryPolicy: item.policy,
      });
      expect(variant.stock).toBe(item.stock);
    }
    if (previous === undefined) delete process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;
    else process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = previous;
  });

  it('marks a bundle unavailable when a component is out of stock', () => {
    const previous = process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const product = catalogueProduct();
    product.bundleComponentOos = true;
    const variant = product.variants[0]!;
    variant.stock = 4;
    variant.inCurekaInventory = false;
    variant.outOfStock = false;

    const detail = mapBobVariantDetail(variant, product, new Map());

    expect(detail.inventoryQuantity).toBe(0);
    expect(detail.inventoryPolicy).toBe('continue');
    expect(variant.stock).toBe(4);
    if (previous === undefined) delete process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;
    else process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = previous;
  });

  it('does not invent a catalogue id when externalProductId is missing', () => {
    const product = catalogueProduct();
    product.externalProductId = null;

    expect(() => mapBobProductSummary(product)).toThrow(
      'Product has no externalProductId for the BOB catalogue',
    );
  });

  it('keeps order line items on internal product and variant ids', () => {
    const payload = mapBobOrder({
      orderStatus: OrderStatus.PROCESSING,
      orderNumber: 'ORD1',
      paymentMethod: OrderPaymentMethod.COD,
      user: { email: 'a@example.com' },
      placedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      cancelReason: null,
      notes: null,
      orderSource: 'Website',
      recipientName: 'A',
      phoneNumber: '9876543210',
      addressLine1: '1',
      addressLine2: null,
      landmark: null,
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
      grandTotal: '532',
      items: [
        {
          productId: PRODUCT_UUID,
          productName: 'Lactisyn Sachets (10 x 1gm Sachet)',
          variantId: VARIANT_UUID,
          variantName: 'Default',
          unitPrice: '532',
          quantity: 1,
          sku: 'NUT/LAC/08623',
          product: { media: [] },
          variant: {},
        },
      ],
    } as unknown as OrderEntity);

    expect(payload.lineItems[0]?.product.id).toBe(PRODUCT_UUID);
    expect(payload.lineItems[0]?.variant.id).toBe(VARIANT_UUID);
  });
});

describe('non-BOB product response', () => {
  it('still returns the internal UUID as id', () => {
    const response = mapProductEntityToResponse({
      id: PRODUCT_UUID,
      refId: 'LAC2026514080',
      externalProductId: CATALOGUE_ID,
      name: 'Lactisyn Sachets (10 x 1gm Sachet)',
      slug: 'lactisyn-sachets-10x1gm-sachet',
      productType: ProductType.SIMPLE,
      status: ProductStatus.PUBLISHED,
      variants: [],
      categoryHierarchies: [],
    } as unknown as ProductEntity);

    expect(response.id).toBe(PRODUCT_UUID);
    expect(response.externalProductId).toBe(CATALOGUE_ID);
    expect(response.refId).toBe('LAC2026514080');
  });
});
