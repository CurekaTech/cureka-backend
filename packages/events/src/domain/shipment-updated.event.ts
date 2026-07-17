export class ShipmentUpdatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly shipmentId: string,
  ) {}
}
