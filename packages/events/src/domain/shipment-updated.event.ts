export class ShipmentUpdatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly shipmentId: string,
    /** Shipment status before this update (for first-transition WhatsApp gating). */
    public readonly previousStatus?: string | null,
  ) {}
}
