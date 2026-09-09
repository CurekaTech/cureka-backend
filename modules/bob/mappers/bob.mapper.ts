import { STOCK_VALIDATION_ENABLED } from '@packages/common';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { isCodPaymentMethod } from '@modules/orders/utils/payment-method.util';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  buildProductCategorySlugPathFromRelations,
  buildProductPermalink,
} from '@modules/public/utils/category-permalink.util';
import { ShipmentEntity } from '@modules/shipping/entities/shipment.entity';
import { ShipmentStatus } from '@modules/shipping/enums/shipment-status.enum';
import { IAbandonedCartDetail } from '@modules/orders/interfaces/abandoned-cart.interface';
import { IUser } from '@modules/users/interfaces/user.interface';
import { IUserAddress } from '@modules/users/interfaces/user-address.interface';
import { IStorageFileReference } from '@packages/storage';
import {
  BobAbandonedCartPayload,
  BobCategory,
  BobFulfillmentEventPayload,
  BobFulfillmentEventStatus,
  BobFulfillmentPayload,
  BobLineItem,
  BobOrderPayload,
  BobPersonalDetails,
  BobProductDetail,
  BobProductOption,
  BobProductSummary,
  BobVariantDetail,
} from '../interfaces/bob.interface';
import { toBobE164Phone, toBobOrderAlias } from '../utils/bob.util';

export function mapBobCategory(category: CategoryEntity): BobCategory {
  return { id: category.id, title: category.name };
}

export function mapBobProductStatus(status: ProductStatus): 'ACTIVE' | 'inactive' {
  return status === ProductStatus.PUBLISHED ? 'ACTIVE' : 'inactive';
}

export function mapBobProductTags(product: ProductEntity): string[] {
  return (product.tagMappings ?? [])
    .map((mapping) => mapping.tag?.name)
    .filter((name): name is string => Boolean(name));
}

export function mapBobProductSummary(product: ProductEntity): BobProductSummary {
  return {
    id: product.id,
    title: product.name,
    status: mapBobProductStatus(product.status),
    tags: mapBobProductTags(product),
  };
}

export function mapBobProductDetail(
  product: ProductEntity,
  imageByKey: Map<string, string>,
  storefrontUrl: string,
): BobProductDetail {
  const variants = activeVariants(product);
  const image = resolveProductImageUrl(product, null, imageByKey);
  const options = collectOptions(variants);
  return {
    id: product.id,
    title: product.name,
    status: mapBobProductStatus(product.status),
    tags: mapBobProductTags(product),
    description: product.description ?? '',
    onlineStoreUrl: buildStoreUrl(storefrontUrl, product),
    image,
    options,
    variants: variants.map((variant) => ({
      id: variant.id,
      title: variantTitle(product, variant),
      price: String(variant.sellingPrice),
      inventoryQuantity: variant.stock,
      inventoryPolicy: STOCK_VALIDATION_ENABLED ? 'deny' : 'continue',
      inventoryManaged: true,
      image: resolveProductImageUrl(product, variant.id, imageByKey) || image,
      description: product.description ?? '',
      selectedOptions: (variant.attributeValues ?? []).map((value) => ({
        name: value.attribute?.name ?? 'Option',
        value: value.value,
      })),
    })),
  };
}

export function mapBobVariantDetail(
  variant: ProductVariantEntity,
  product: ProductEntity,
  imageByKey: Map<string, string>,
): BobVariantDetail {
  const productImage = resolveProductImageUrl(product, null, imageByKey);
  return {
    id: variant.id,
    title: variantTitle(product, variant),
    price: String(variant.sellingPrice),
    inventoryQuantity: variant.stock,
    inventoryPolicy: STOCK_VALIDATION_ENABLED ? 'deny' : 'continue',
    inventoryManaged: true,
    image: resolveProductImageUrl(product, variant.id, imageByKey) || productImage,
    product: {
      id: product.id,
      title: product.name,
      image: productImage,
    },
  };
}

export function mapBobOrder(
  order: OrderEntity,
  shipment?: ShipmentEntity | null,
  imageByKey?: Map<string, string>,
): BobOrderPayload {
  const cancelled = order.orderStatus === OrderStatus.CANCELLED;
  const orderAlias = toBobOrderAlias(order.orderNumber);
  // BOB WhatsApp templates: fullyPaid true = prepaid, false = COD / partial COD.
  const isCodLike =
    isCodPaymentMethod(order.paymentMethod) ||
    order.paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD;
  const fullyPaid = !isCodLike;
  return {
    id: orderAlias,
    name: orderAlias,
    email: order.user?.email ?? '',
    createdAt: (order.placedAt ?? order.createdAt).toISOString(),
    fullyPaid,
    cancelReason: cancelled ? order.cancelReason : null,
    cancelledAt: cancelled ? order.updatedAt.toISOString() : null,
    note: order.notes,
    channel: String(order.orderSource ?? 'Website'),
    shippingAddress: {
      name: order.recipientName,
      phone: toBobE164Phone(order.phoneNumber),
      address1: order.addressLine1,
      address2: [order.addressLine2, order.landmark].filter(Boolean).join(', '),
      city: order.city,
      province: order.state,
      country: 'India',
      zip: order.pincode,
    },
    total_amount: String(order.grandTotal),
    currencyCode: 'INR',
    lineItems: (order.items ?? []).map((item) => mapBobLineItem(item, imageByKey)),
    shipment_details: {
      status: mapBobShipmentStatus(order.orderStatus, shipment?.shipmentStatus),
      tracking_info: shipment?.trackingUrl ?? shipment?.awbNumber ?? '',
    },
  };
}

export function mapBobPersonalDetails(params: {
  user: IUser;
  address?: IUserAddress | null;
  ordersCount: number;
  totalSpent: string;
  lastOrder: BobOrderPayload | null;
}): BobPersonalDetails {
  const firstName = params.user.firstName ?? '';
  const lastName = params.user.lastName ?? '';
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || params.user.mobileNumber || '';
  const address = params.address;
  return {
    id: params.user.id,
    displayName,
    firstName,
    lastName,
    ordersCount: params.ordersCount,
    totalSpent: params.totalSpent,
    currencyCode: 'INR',
    defaultAddress: address
      ? {
          id: address.id,
          customer_id: params.user.id,
          first_name: firstName,
          last_name: lastName,
          address1: address.addressLine1,
          address2: address.addressLine2,
          city: address.city,
          province: address.state,
          country: 'India',
          zip: address.pincode,
          phone: address.phoneNumber,
          name: address.recipientName,
          province_code: null,
          country_code: 'IN',
          country_name: 'India',
          default: address.isDefault,
        }
      : null,
    email: params.user.email ?? '',
    lastOrder: params.lastOrder,
  };
}

export function mapBobFulfillment(
  order: OrderEntity,
  shipment: ShipmentEntity,
  imageByKey?: Map<string, string>,
): BobFulfillmentPayload {
  const names = (order.recipientName ?? '').trim().split(/\s+/);
  const phone = toBobE164Phone(order.phoneNumber);
  const orderAlias = toBobOrderAlias(order.orderNumber);
  return {
    // BOB team example uses order alias for fulfillment_id / id / id_alias.
    fulfillment_id: orderAlias,
    id: orderAlias,
    id_alias: orderAlias,
    lineItems: (order.items ?? []).map((item) => mapBobLineItem(item, imageByKey)),
    customer: {
      email: order.user?.email ?? '',
      first_name: names[0] ?? '',
      last_name: names.slice(1).join(' '),
      phone,
      orders_count: null,
      total_spent: null,
      last_order_id: null,
    },
    order_details: {
      total_price: Number(order.grandTotal),
      total_tax: 0,
      total_discount: Number(order.discountAmount ?? 0),
      currency: 'INR',
    },
    tracking_info: {
      tracking_number: shipment.awbNumber ?? '',
      tracking_url: shipment.trackingUrl ?? '',
      tracking_company_name: shipment.courierName ?? '',
      // BOB team example uses "shipped" for fulfillments-create.
      shipping_status: 'shipped',
    },
    phone,
    fulfilled_at: (shipment.pushedAt ?? shipment.updatedAt).toISOString(),
  };
}

export function mapBobFulfillmentEvent(
  order: OrderEntity,
  shipment: ShipmentEntity,
): BobFulfillmentEventPayload {
  return {
    delivery_id: shipment.id,
    id: order.id,
    id_alias: order.orderNumber,
    fulfillment_id: shipment.id,
    status: mapBobEventStatus(shipment.shipmentStatus),
    delivered_at: (shipment.lastSyncedAt ?? shipment.updatedAt).toISOString(),
  };
}

/** Map Cureka storefront abandoned cart → BOB Notifications abandoned-cart shape. */
export function mapCurekaAbandonedCartToBob(params: {
  detail: IAbandonedCartDetail;
  recoveryUrl: string;
  storefrontUrl?: string;
}): BobAbandonedCartPayload {
  const { detail, recoveryUrl } = params;
  const customer = detail.customer;
  const cart = detail.cart;
  const address = detail.defaultAddress ?? detail.addresses[0] ?? null;
  const phone = String(customer.mobileNumber ?? address?.phoneNumber ?? '');
  const storefront = (params.storefrontUrl ?? '').replace(/\/+$/, '');

  const mappedAddress = address
    ? {
        address: [address.addressLine1, address.addressLine2].filter(Boolean).join(', '),
        city: address.city,
        province: address.state,
        country: 'India',
        zip: address.pincode,
      }
    : { address: '', city: '', province: '', country: 'India', zip: '' };

  return {
    checkout_id: detail.refId,
    cart_recovery_url: recoveryUrl,
    line_items: (cart.items ?? []).map((item) => {
      const slug = item.productSlug?.trim() || '';
      // BOB historically used line_items.id as Shopify handle under /products/{id}.
      // Cureka PDPs are /shop/.../{slug}; never pass variant UUID here.
      const id = slug || item.productId || item.variantId || item.id;
      const productUrl = slug
        ? storefront
          ? `${storefront}/shop/${encodeURIComponent(slug)}`
          : `/shop/${encodeURIComponent(slug)}`
        : undefined;
      return {
        id,
        name: item.productName,
        image: {
          originalSrc: item.primaryImageUrl?.url ?? '',
        },
        quantity: item.quantity,
        price: item.unitPrice,
        ...(productUrl ? { product_url: productUrl } : {}),
      };
    }),
    customer: {
      email: customer.email ?? '',
      first_name: customer.firstName ?? '',
      last_name: customer.lastName ?? '',
      phone,
    },
    order_details: {
      total_price: cart.grandTotal,
      total_tax: 0,
      total_discount: cart.discountAmount ?? 0,
      currency: 'INR',
    },
    address: {
      billing_address: mappedAddress,
      shipping_address: mappedAddress,
    },
    phone,
    created_at: detail.lastActivityAt.toISOString(),
  };
}

export function mapBobAbandonedCart(params: {
  checkoutId: string;
  recoveryUrl: string;
  payload: Record<string, unknown>;
}): BobAbandonedCartPayload {
  const data = asRecord(params.payload.data) ?? params.payload;
  const customer = asRecord(data.customer) ?? {};
  const shipping = asRecord(data.shipping_address) ?? asRecord(data.shippingAddress) ?? {};
  const billing = asRecord(data.billing_address) ?? asRecord(data.billingAddress) ?? shipping;
  const items = asArray(data.line_items) ?? asArray(data.lineItems) ?? asArray(data.items) ?? [];
  const phone = String(
    data.phone ?? data.mobile ?? customer.phone ?? shipping.phone ?? '',
  );
  const createdAt = String(data.created_at ?? data.createdAt ?? new Date().toISOString());

  return {
    checkout_id: params.checkoutId,
    cart_recovery_url: String(data.recovery_url ?? data.cart_recovery_url ?? params.recoveryUrl),
    line_items: items.map((item, index) => {
      const row = asRecord(item) ?? {};
      const image = asRecord(row.image);
      return {
        id: String(row.id ?? row.variant_id ?? `item-${index}`),
        name: String(row.name ?? row.title ?? row.product_name ?? 'Item'),
        image: {
          originalSrc: String(
            image?.originalSrc ?? row.image_url ?? row.imageUrl ?? '',
          ),
        },
        quantity: Number(row.quantity ?? 1),
        price: Number(row.price ?? row.selling_price ?? 0),
      };
    }),
    customer: {
      email: String(customer.email ?? data.email ?? ''),
      first_name: String(customer.first_name ?? customer.firstName ?? ''),
      last_name: String(customer.last_name ?? customer.lastName ?? ''),
      phone,
    },
    order_details: {
      total_price: Number(data.total_price ?? data.total ?? 0),
      total_tax: Number(data.total_tax ?? 0),
      total_discount: Number(data.total_discount ?? 0),
      currency: String(data.currency ?? 'INR'),
    },
    address: {
      billing_address: mapAbandonedAddress(billing),
      shipping_address: mapAbandonedAddress(shipping),
    },
    phone,
    created_at: createdAt,
  };
}

function mapAbandonedAddress(row: Record<string, unknown>): {
  address: string;
  city: string;
  province: string;
  country: string;
  zip: string;
} {
  return {
    address: String(row.address ?? row.address1 ?? row.address_line1 ?? ''),
    city: String(row.city ?? ''),
    province: String(row.province ?? row.state ?? ''),
    country: String(row.country ?? 'India'),
    zip: String(row.zip ?? row.pincode ?? ''),
  };
}

export function collectImageRefs(product: ProductEntity): IStorageFileReference[] {
  return (product.media ?? [])
    .map((item) => item.url)
    .filter((url): url is IStorageFileReference => Boolean(url?.key));
}

function variantWeight(item: OrderItemEntity): string {
  const weight = item.variant?.weight?.trim();
  if (!weight) return '';
  const unit = item.variant?.weightUnit?.trim();
  return unit ? `${weight} ${unit}` : weight;
}

function mapBobLineItem(item: OrderItemEntity, imageByKey?: Map<string, string>): BobLineItem {
  const media = item.product?.media?.[0]?.url;
  const key =
    media && typeof media === 'object' && 'key' in media ? String(media.key ?? '') : '';
  const signed = key && imageByKey ? imageByKey.get(key) : undefined;
  const alreadyUrl =
    media && typeof media === 'object' && 'url' in media ? String(media.url ?? '') : '';
  return {
    image: { originalSrc: signed || alreadyUrl || '' },
    product: { id: item.productId, title: item.productName },
    variant: {
      id: item.variantId,
      title: item.variantName || 'Default Title',
      price: String(item.unitPrice),
      weight: variantWeight(item),
      sku: item.sku,
    },
    variantTitle: item.variantName ?? '',
    quantity: item.quantity,
  };
}

export function mapBobEventStatus(
  status: ShipmentStatus | string | null | undefined,
): BobFulfillmentEventStatus {
  switch (status) {
    case ShipmentStatus.DELIVERED:
      return 'Delivered';
    case ShipmentStatus.IN_TRANSIT:
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 'In-transit';
    case ShipmentStatus.RTO:
    case ShipmentStatus.RTO_INITIATED:
      return 'Returned';
    default:
      return 'Dispatched';
  }
}

/**
 * UI step "Dispatched" and anything after it on the 4-step tracker:
 * Confirmed → Dispatched → Out for Delivery → Delivered.
 * Used to fire /fulfillments-create only on the first transition into this set.
 */
export function isBobDispatchedOrLater(
  status: ShipmentStatus | string | null | undefined,
): boolean {
  switch (status) {
    case ShipmentStatus.PICKUP_COMPLETE:
    case ShipmentStatus.IN_TRANSIT:
    case ShipmentStatus.OUT_FOR_DELIVERY:
    case ShipmentStatus.DELIVERED:
      return true;
    default:
      return false;
  }
}

/** Friendly 4-step tracker label for logs. */
export function bobTrackerStepLabel(
  status: ShipmentStatus | string | null | undefined,
): 'Order Confirmed' | 'Dispatched' | 'Out for Delivery' | 'Delivered' {
  switch (status) {
    case ShipmentStatus.DELIVERED:
      return 'Delivered';
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return 'Out for Delivery';
    case ShipmentStatus.PICKUP_COMPLETE:
    case ShipmentStatus.IN_TRANSIT:
      return 'Dispatched';
    default:
      return 'Order Confirmed';
  }
}

function mapBobShipmentStatus(
  orderStatus: OrderStatus,
  shipmentStatus?: ShipmentStatus | null,
): string {
  if (shipmentStatus) {
    return shipmentStatus.toLowerCase().replace(/_/g, '-');
  }
  return String(orderStatus).toLowerCase().replace(/_/g, '-');
}

function activeVariants(product: ProductEntity): ProductVariantEntity[] {
  return (product.variants ?? []).filter(
    (variant) => variant.status === VariantStatus.ACTIVE && !variant.deletedAt,
  );
}

function variantTitle(product: ProductEntity, variant: ProductVariantEntity): string {
  const options = (variant.attributeValues ?? [])
    .map((value) => value.value)
    .filter(Boolean);
  if (!options.length) {
    return product.name;
  }
  return `${product.name} / ${options.join(' / ')}`;
}

function collectOptions(variants: ProductVariantEntity[]): BobProductOption[] {
  const valuesByName = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const value of variant.attributeValues ?? []) {
      const name = value.attribute?.name ?? 'Option';
      const set = valuesByName.get(name) ?? new Set<string>();
      set.add(value.value);
      valuesByName.set(name, set);
    }
  }
  return [...valuesByName.entries()].map(([name, values]) => ({
    name,
    values: [...values],
  }));
}

function resolveProductImageUrl(
  product: ProductEntity,
  variantId: string | null,
  imageByKey: Map<string, string>,
): string {
  const media = (product.media ?? []).filter(
    (item: ProductMediaEntity) =>
      item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON,
  );
  const variantMedia = variantId ? media.filter((item) => item.variantId === variantId) : [];
  const chosen =
    (variantMedia.find((item) => item.isPrimary) ?? variantMedia[0]) ||
    media.find((item) => !item.variantId && item.isPrimary) ||
    media.find((item) => !item.variantId) ||
    media[0];
  const key = chosen?.url?.key;
  return (key && imageByKey.get(key)) || '';
}

function buildStoreUrl(storefrontUrl: string, product: ProductEntity): string {
  const base = storefrontUrl.replace(/\/+$/, '');
  const path = buildProductPermalink(
    buildProductCategorySlugPathFromRelations(product),
    product.slug,
  );
  return base ? `${base}${path}` : path;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
