import { Injectable } from '@nestjs/common';
import { ICodPayoutProvider, ICodPayoutProviderResult } from '../../interfaces/cod-refund-payout.interface';

/**
 * Default COD payout adapter. No collection-gateway (Razorpay/Cashfree/GoKwik)
 * is treated as a payout integration. Finance records the bank transfer in Cureka.
 */
@Injectable()
export class ManualCodPayoutProvider implements ICodPayoutProvider {
  readonly code = 'MANUAL';

  isConfigured(): boolean {
    return true;
  }

  async submit(_payout?: {
    id: string;
    amount: string;
    currency: string;
  }): Promise<ICodPayoutProviderResult> {
    return {
      accepted: true,
      providerReference: null,
      message: 'Manual bank transfer — record UTR after the payment leaves the company account',
    };
  }
}
