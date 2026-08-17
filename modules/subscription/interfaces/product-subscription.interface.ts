import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionDiscountType } from '../enums/subscription-discount-type.enum';
import { SubscriptionMissedPaymentAction } from '../enums/subscription-missed-payment-action.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';

export interface ISubscriptionUserSummary {
  id: string;
  refId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobileNumber: string | null;
}

export interface ISubscriptionProductSummary {
  id: string;
  refId: string;
  name: string;
  slug: string;
  status: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface ISubscriptionVariantSummary {
  id: string;
  productId: string;
  sku: string;
  slug: string;
  displayName: string | null;
  sellingPrice: string;
  mrp: string;
  status: string;
}

export interface IProductSubscriptionConfig {
  id: string;
  refId: string;
  productId: string;
  productVariantId: string | null;
  enabled: boolean;
  frequencies: ProductSubscriptionFrequency[];
  discountType: SubscriptionDiscountType;
  discountValue: string;
  minDurationMonths: number | null;
  maxDurationMonths: number | null;
  pauseAllowed: boolean;
  frequencyChangeAllowed: boolean;
  cancellationAllowed: boolean;
  skipAllowed: boolean;
  gracePeriodDays: number;
  missedPaymentAction: SubscriptionMissedPaymentAction;
  renewalMethod: SubscriptionRenewalMethod;
  reminderOffsetsJson: number[];
  product?: ISubscriptionProductSummary | null;
  variant?: ISubscriptionVariantSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface IUserProductSubscription {
  id: string;
  refId: string;
  userId: string;
  productId: string;
  productVariantId: string;
  addressId: string;
  quantity: number;
  frequency: ProductSubscriptionFrequency;
  subscriptionPrice: string;
  discountValue: string;
  finalAmount: string;
  discountType: SubscriptionDiscountType;
  startDate: string | null;
  nextBillingDate: string | null;
  nextDeliveryDate: string | null;
  status: ProductSubscriptionStatus;
  renewalMethod: SubscriptionRenewalMethod;
  paymentGateway: string | null;
  cancellationDate: string | null;
  cancellationReason: string | null;
  pausedAt: string | null;
  pauseUntil: string | null;
  billingCycleSequence: number;
  configId: string | null;
  paymentLink?: string | null;
  razorpayOrderId?: string | null;
  keyId?: string | null;
  amount?: number | null;
  currency?: string | null;
  paymentSessionId?: string | null;
  environment?: 'sandbox' | 'production' | null;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  } | null;
  user?: ISubscriptionUserSummary | null;
  product?: ISubscriptionProductSummary | null;
  variant?: ISubscriptionVariantSummary | null;
  productName?: string | null;
  productImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ISubscriptionPayment {
  id: string;
  refId: string;
  subscriptionId: string;
  userId: string;
  billingCycleRef: string;
  amount: string;
  currency: string;
  paymentGateway: string | null;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  paymentLink: string | null;
  paymentSessionId?: string | null;
  status: string;
  billingDate: string;
  paidAt: string | null;
  failureReason: string | null;
  retryCount: number;
  user?: ISubscriptionUserSummary | null;
  product?: ISubscriptionProductSummary | null;
  variant?: ISubscriptionVariantSummary | null;
  subscription?: Pick<
    IUserProductSubscription,
    'id' | 'refId' | 'status' | 'frequency' | 'quantity' | 'finalAmount'
  > | null;
  createdAt: string;
  updatedAt: string;
}

export interface ISubscriptionListResponse<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
