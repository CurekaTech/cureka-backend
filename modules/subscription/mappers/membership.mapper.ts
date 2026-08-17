import { MembershipBenefitEntity } from '../entities/membership-benefit.entity';
import { MembershipPaymentEntity } from '../entities/membership-payment.entity';
import { MembershipPlanEntity } from '../entities/membership-plan.entity';
import { UserMembershipEntity } from '../entities/user-membership.entity';
import {
  IMembershipBenefit,
  IMembershipPayment,
  IMembershipPlan,
  IUserMembership,
} from '../interfaces/membership.interface';
import {
  paymentSessionIdFromLink,
  type SubscriptionCheckoutExtras,
} from '../utils/checkout-extras.util';

const toIso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

const readMinOrderValue = (
  metadata: Record<string, unknown> | null | undefined,
): string | null => {
  const raw = metadata?.['minOrderValue'];
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num.toFixed(2) : null;
};

export const mapMembershipBenefitToResponse = (
  entity: MembershipBenefitEntity,
): IMembershipBenefit => ({
  id: entity.id,
  refId: entity.refId,
  membershipPlanId: entity.membershipPlanId,
  benefitType: entity.benefitType,
  valueType: entity.valueType,
  value: entity.value,
  minOrderValue: readMinOrderValue(entity.metadata),
  metadata: entity.metadata,
  status: entity.status,
  sortOrder: entity.sortOrder,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export const mapMembershipPlanToResponse = (entity: MembershipPlanEntity): IMembershipPlan => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  description: entity.description,
  price: entity.price,
  currency: entity.currency,
  billingCycle: entity.billingCycle,
  validityDays: entity.validityDays,
  renewalEnabled: entity.renewalEnabled,
  gracePeriodDays: entity.gracePeriodDays,
  status: entity.status,
  sortOrder: entity.sortOrder,
  renewalMethod: entity.renewalMethod,
  benefits: entity.benefits?.map(mapMembershipBenefitToResponse),
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export const mapUserMembershipToResponse = (
  entity: UserMembershipEntity,
  extras?: SubscriptionCheckoutExtras & {
    plan?: IMembershipPlan | null;
    user?: IUserMembership['user'];
  },
): IUserMembership => ({
  id: entity.id,
  refId: entity.refId,
  userId: entity.userId,
  membershipPlanId: entity.membershipPlanId,
  status: entity.status,
  startDate: toIso(entity.startDate),
  endDate: toIso(entity.endDate),
  nextBillingDate: toIso(entity.nextBillingDate),
  renewalMethod: entity.renewalMethod,
  paymentGateway: entity.paymentGateway,
  cancellationDate: toIso(entity.cancellationDate),
  cancellationReason: entity.cancellationReason,
  pausedAt: toIso(entity.pausedAt),
  termsAcceptedAt: toIso(entity.termsAcceptedAt),
  paymentLink: extras?.paymentLink ?? null,
  razorpayOrderId: extras?.razorpayOrderId ?? null,
  keyId: extras?.keyId ?? null,
  amount: extras?.amount ?? null,
  currency: extras?.currency ?? null,
  paymentSessionId: extras?.paymentSessionId ?? null,
  environment: extras?.environment ?? null,
  customer: extras?.customer ?? null,
  plan: extras?.plan ?? null,
  user: extras?.user ?? null,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export const mapMembershipPaymentToResponse = (
  entity: MembershipPaymentEntity,
  extras?: {
    user?: IMembershipPayment['user'];
    plan?: IMembershipPayment['plan'];
    membership?: IMembershipPayment['membership'];
  },
): IMembershipPayment => ({
  id: entity.id,
  refId: entity.refId,
  userMembershipId: entity.userMembershipId,
  userId: entity.userId,
  membershipPlanId: entity.membershipPlanId,
  amount: entity.amount,
  currency: entity.currency,
  billingCycleRef: entity.billingCycleRef,
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
  user: extras?.user ?? null,
  plan: extras?.plan ?? null,
  membership: extras?.membership ?? null,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});
