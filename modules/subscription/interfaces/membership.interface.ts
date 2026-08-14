import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { MembershipBenefitType } from '../enums/membership-benefit-type.enum';
import { MembershipBenefitValueType } from '../enums/membership-benefit-value-type.enum';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { MembershipStatus } from '../enums/membership-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import {
  ISubscriptionListResponse,
  ISubscriptionUserSummary,
} from './product-subscription.interface';

export type { ISubscriptionListResponse, ISubscriptionUserSummary };

export interface IMembershipBenefit {
  id: string;
  refId: string;
  membershipPlanId: string;
  benefitType: MembershipBenefitType;
  valueType: MembershipBenefitValueType;
  value: string | null;
  metadata: Record<string, unknown> | null;
  status: MembershipPlanStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface IMembershipPlan {
  id: string;
  refId: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  billingCycle: MembershipBillingCycle;
  validityDays: number;
  renewalEnabled: boolean;
  gracePeriodDays: number;
  status: MembershipPlanStatus;
  sortOrder: number;
  renewalMethod: SubscriptionRenewalMethod;
  benefits?: IMembershipBenefit[];
  createdAt: string;
  updatedAt: string;
}

export interface IUserMembership {
  id: string;
  refId: string;
  userId: string;
  membershipPlanId: string;
  status: MembershipStatus;
  startDate: string | null;
  endDate: string | null;
  nextBillingDate: string | null;
  renewalMethod: SubscriptionRenewalMethod;
  paymentGateway: string | null;
  cancellationDate: string | null;
  cancellationReason: string | null;
  pausedAt: string | null;
  termsAcceptedAt: string | null;
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
  plan?: IMembershipPlan | null;
  user?: ISubscriptionUserSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface IMembershipPayment {
  id: string;
  refId: string;
  userMembershipId: string;
  userId: string;
  membershipPlanId: string;
  amount: string;
  currency: string;
  billingCycleRef: string;
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
  plan?: IMembershipPlan | null;
  membership?: Pick<
    IUserMembership,
    'id' | 'refId' | 'status' | 'startDate' | 'endDate' | 'nextBillingDate'
  > | null;
  createdAt: string;
  updatedAt: string;
}
