/** Identity of a bundle component frozen on the order line. Not policy, price, or COD. */
export interface IOrderItemBundleComponent {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantityPerBundle: number;
}
