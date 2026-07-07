import { Injectable } from '@nestjs/common';
import {
  ICheckoutProvider,
  ICreateShiprocketCheckoutSessionInput,
  IShiprocketCheckoutSession,
  IShiprocketPaymentVerificationResult,
} from '../interfaces/checkout-provider.interface';
import { ShiprocketCheckoutService } from '../services/shiprocket-checkout.service';

@Injectable()
export class ShiprocketCheckoutProvider implements ICheckoutProvider {
  readonly name = 'shiprocket' as const;

  constructor(private readonly shiprocketCheckoutService: ShiprocketCheckoutService) {}

  createSession(input: ICreateShiprocketCheckoutSessionInput): Promise<IShiprocketCheckoutSession> {
    return this.shiprocketCheckoutService.createSession(input);
  }

  verifyPayment(sessionId: string): Promise<IShiprocketPaymentVerificationResult> {
    return this.shiprocketCheckoutService.verifyPayment(sessionId);
  }
}
