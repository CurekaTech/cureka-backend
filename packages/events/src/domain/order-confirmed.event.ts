import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';

export interface OrderConfirmedSubscriptionItem {
  productId: string;
  variantId: string;
  quantity: number;
  frequency: ProductSubscriptionFrequency;
}

export class OrderConfirmedEvent {
  constructor(
    public readonly orderId: string,
    public readonly orderNumber: string,
    public readonly userId: string,
    public readonly addressId: string | null,
    public readonly subscriptionItems: OrderConfirmedSubscriptionItem[],
  ) {}
}
