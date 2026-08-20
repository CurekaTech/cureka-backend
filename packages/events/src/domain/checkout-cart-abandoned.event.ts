export class CheckoutCartAbandonedEvent {
  constructor(
    public readonly checkoutId: string,
    public readonly merchantCartId: string | null,
    public readonly payload: Record<string, unknown>,
  ) {}
}
