import {
  PRODUCT_FREQUENCY_LABELS,
  PRODUCT_FREQUENCY_MONTHS,
} from '../constants/subscription.constants';
import { ProductSubscriptionConfigEntity } from '../entities/product-subscription-config.entity';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import { UserProductSubscriptionEntity } from '../entities/user-product-subscription.entity';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import {
  IProductSubscriptionConfig,
  ISubscriptionPayment,
  IUserProductSubscription,
} from '../interfaces/product-subscription.interface';
import {
  paymentSessionIdFromLink,
  type SubscriptionCheckoutExtras,
} from '../utils/checkout-extras.util';

const toIso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

export const mapProductSubscriptionConfigToResponse = (
  entity: ProductSubscriptionConfigEntity,
): IProductSubscriptionConfig => ({
  id: entity.id,
  refId: entity.refId,
  productId: entity.productId,
  productVariantId: entity.productVariantId,
  enabled: entity.enabled,
  frequencies: entity.frequencies ?? [],
  discountType: entity.discountType,
  discountValue: entity.discountValue,
  minDurationMonths: entity.minDurationMonths,
  maxDurationMonths: entity.maxDurationMonths,
  pauseAllowed: entity.pauseAllowed,
  frequencyChangeAllowed: entity.frequencyChangeAllowed,
  cancellationAllowed: entity.cancellationAllowed,
  skipAllowed: entity.skipAllowed,
  gracePeriodDays: entity.gracePeriodDays,
  missedPaymentAction: entity.missedPaymentAction,
  renewalMethod: entity.renewalMethod,
  reminderOffsetsJson: entity.reminderOffsetsJson ?? [],
  quantityChangeAllowed: entity.quantityChangeAllowed ?? false,
  mandateMaxAmount: entity.mandateMaxAmount ?? null,
  timezone: entity.timezone ?? 'Asia/Kolkata',
  deliveryLeadDays: entity.deliveryLeadDays ?? 2,
  maxRetryAttempts: entity.maxRetryAttempts ?? 3,
  changeCutoffHours: entity.changeCutoffHours ?? 12,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export const mapUserProductSubscriptionToResponse = (
  entity: UserProductSubscriptionEntity,
  extras?: SubscriptionCheckoutExtras & {
    user?: IUserProductSubscription['user'];
    product?: IUserProductSubscription['product'];
    variant?: IUserProductSubscription['variant'];
    mandateStatus?: string | null;
    cycleInFlight?: boolean;
  },
): IUserProductSubscription => {
  const activeLike = [
    ProductSubscriptionStatus.ACTIVE,
    ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
  ].includes(entity.status);
  const paused = entity.status === ProductSubscriptionStatus.PAUSED;
  const pendingPay = [
    ProductSubscriptionStatus.PENDING_PAYMENT,
    ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
    ProductSubscriptionStatus.PAST_DUE,
  ].includes(entity.status);
  const cutoff = extras?.cycleInFlight === true;

  return {
    id: entity.id,
    refId: entity.refId,
    userId: entity.userId,
    productId: entity.productId,
    productVariantId: entity.productVariantId,
    addressId: entity.addressId,
    quantity: entity.quantity,
    frequency: entity.frequency,
    subscriptionPrice: entity.subscriptionPrice,
    discountValue: entity.discountValue,
    finalAmount: entity.finalAmount,
    discountType: entity.discountType,
    startDate: toIso(entity.startDate),
    nextBillingDate: toIso(entity.nextBillingDate),
    nextDeliveryDate: toIso(entity.nextDeliveryDate),
    status: entity.status,
    renewalMethod: entity.autopayReady
      ? SubscriptionRenewalMethod.AUTO_PAY
      : SubscriptionRenewalMethod.PAYMENT_LINK,
    paymentGateway: entity.paymentGateway,
    cancellationDate: toIso(entity.cancellationDate),
    cancellationReason: entity.cancellationReason,
    pausedAt: toIso(entity.pausedAt),
    pauseUntil: toIso(entity.pauseUntil),
    billingCycleSequence: entity.billingCycleSequence,
    configId: entity.configId,
    timezone: entity.timezone ?? 'Asia/Kolkata',
    scheduleAnchorDay: entity.scheduleAnchorDay ?? null,
    autopayReady: !!entity.autopayReady,
    skipNextCycle: !!entity.skipNextCycle,
    firstOrderId: entity.firstOrderId ?? null,
    mandateId: entity.mandateId ?? null,
    mandateMaxAmount: entity.mandateMaxAmount ?? null,
    mandateStatus: extras?.mandateStatus ?? null,
    intervalMonths: PRODUCT_FREQUENCY_MONTHS[entity.frequency],
    intervalLabel: PRODUCT_FREQUENCY_LABELS[entity.frequency],
    allowedActions: {
      pause: activeLike && (entity.config?.pauseAllowed ?? true) && !cutoff,
      resume: paused,
      skip: activeLike && (entity.config?.skipAllowed ?? true) && !cutoff,
      cancel:
        ![ProductSubscriptionStatus.CANCELLED, ProductSubscriptionStatus.EXPIRED].includes(
          entity.status,
        ) && (entity.config?.cancellationAllowed ?? true),
      changeFrequency: activeLike && (entity.config?.frequencyChangeAllowed ?? true) && !cutoff,
      changeAddress: activeLike && !cutoff,
      changeQuantity: activeLike && (entity.config?.quantityChangeAllowed ?? false) && !cutoff,
      setupMandate: activeLike && !entity.autopayReady,
      retryPayment: pendingPay,
    },
    paymentLink: extras?.paymentLink ?? null,
    razorpayOrderId: extras?.razorpayOrderId ?? null,
    keyId: extras?.keyId ?? null,
    amount: extras?.amount ?? null,
    currency: extras?.currency ?? 'INR',
    paymentSessionId: extras?.paymentSessionId ?? null,
    environment: extras?.environment ?? null,
    customer: extras?.customer ?? null,
    user: extras?.user ?? null,
    product: extras?.product ?? null,
    variant: extras?.variant ?? null,
    productName: extras?.product?.name ?? null,
    productImageUrl: extras?.product?.imageUrl ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
};

export const mapSubscriptionPaymentToResponse = (
  entity: SubscriptionPaymentEntity,
  extras?: {
    user?: ISubscriptionPayment['user'];
    product?: ISubscriptionPayment['product'];
    variant?: ISubscriptionPayment['variant'];
    subscription?: ISubscriptionPayment['subscription'];
  },
): ISubscriptionPayment => ({
  id: entity.id,
  refId: entity.refId,
  subscriptionId: entity.subscriptionId,
  userId: entity.userId,
  billingCycleRef: entity.billingCycleRef,
  amount: entity.amount,
  currency: entity.currency,
  paymentGateway: entity.paymentGateway,
  gatewayOrderId: entity.gatewayOrderId,
  gatewayPaymentId: entity.gatewayPaymentId,
  paymentLink: entity.paymentLink,
  paymentSessionId: paymentSessionIdFromLink(entity.paymentLink),
  status: entity.status,
  billingDate: entity.billingDate.toISOString(),
  paidAt: toIso(entity.paidAt),
  failureReason: entity.failureReason,
  retryCount: entity.retryCount,
  billingCycleId: entity.billingCycleId ?? null,
  orderId: entity.orderId ?? null,
  attemptKind: entity.attemptKind ?? null,
  user: extras?.user ?? null,
  product: extras?.product ?? null,
  variant: extras?.variant ?? null,
  subscription: extras?.subscription ?? null,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});
