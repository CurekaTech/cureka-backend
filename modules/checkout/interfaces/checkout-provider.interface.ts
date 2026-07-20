export type CheckoutProviderName = 'legacy' | 'shiprocket' | 'gokwik';

export interface ICheckoutProvider {
  readonly name: CheckoutProviderName;
}

export interface IShiprocketCheckoutItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface IShiprocketCheckoutCustomer {
  id: string;
  name: string;
  email?: string;
  phone: string;
}

export interface IShiprocketCheckoutAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface ICreateShiprocketCheckoutSessionInput {
  merchantOrderId: string;
  paymentRequestId: string;
  amount: number;
  currency: string;
  customer: IShiprocketCheckoutCustomer;
  shippingAddress: IShiprocketCheckoutAddress;
  items: IShiprocketCheckoutItem[];
  successUrl?: string;
  failureUrl?: string;
  metadata?: Record<string, string>;
}

export interface IShiprocketCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
  expiresAt?: Date | null;
  raw: Record<string, unknown>;
}

export interface IShiprocketPaymentVerificationResult {
  paid: boolean;
  paymentId?: string;
  status?: string;
  raw: Record<string, unknown>;
}
