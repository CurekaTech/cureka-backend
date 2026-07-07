import { Injectable } from '@nestjs/common';
import { ICheckoutProvider } from '../interfaces/checkout-provider.interface';

@Injectable()
export class LegacyCheckoutProvider implements ICheckoutProvider {
  readonly name = 'legacy' as const;
}
