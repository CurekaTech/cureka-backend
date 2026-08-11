export class OrderCancelledEvent {
  constructor(
    public readonly orderId: string,
    public readonly orderNumber: string,
    public readonly cancelReason: string,
  ) {}
}
