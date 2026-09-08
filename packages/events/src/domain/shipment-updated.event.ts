export class ShipmentUpdatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly shipmentId: string,
    /** Shipment status before this update (for first-transition WhatsApp gating). */
    public readonly previousStatus?: string | null,
    /**
     * When true, listeners must not enqueue customer WhatsApp / BOB fulfillment.
     * Used for GET-driven sync and recovery --apply without --notify.
     */
    public readonly suppressCustomerNotify?: boolean,
  ) {}
}
