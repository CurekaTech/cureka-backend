export type SubscriptionGatewayNotesInput = {
  paymentPurpose: string;
  billingCycleRef: string;
  subscriptionId?: string;
  userMembershipId?: string;
  userId?: string;
  productId?: string;
  membershipPlanId?: string;
  [key: string]: string | undefined;
};

export function buildSubscriptionGatewayNotes(
  input: SubscriptionGatewayNotesInput,
): Record<string, string> {
  const notes: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== '') {
      notes[key] = value;
    }
  }

  return notes;
}
