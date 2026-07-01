import { IsUUID } from 'class-validator';

export class CheckoutCancelPaymentDto {
  @IsUUID()
  paymentRequestId!: string;
}
