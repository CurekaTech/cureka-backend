import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { ShipmentEventEntity } from './shipment-event.entity';

@Entity('shipments')
export class ShipmentEntity extends BaseEntity {
  // ── Linking back to the order ────────────────────────────────────────────────

  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  /** Denormalised for fast lookups without joining orders. */
  @Index()
  @Column({ name: 'order_number', type: 'varchar', length: 30 })
  orderNumber!: string;

  // ── What Shipway sent to us when we pushed the order ─────────────────────────

  /** The `order_id` we sent to Shipway — equals our orderNumber. */
  @Index({ unique: true })
  @Column({ name: 'shipway_order_id', type: 'varchar', length: 100 })
  shipwayOrderId!: string;

  // ── What Shipway returned after booking ──────────────────────────────────────

  @Index()
  @Column({ name: 'shipment_id', type: 'varchar', length: 100, nullable: true })
  shipmentId!: string | null;

  @Index()
  @Column({ name: 'awb_number', type: 'varchar', length: 100, nullable: true })
  awbNumber!: string | null;

  @Column({ name: 'courier_name', type: 'varchar', length: 255, nullable: true })
  courierName!: string | null;

  @Column({ name: 'courier_id', type: 'varchar', length: 50, nullable: true })
  courierId!: string | null;

  @Column({ name: 'tracking_url', type: 'text', nullable: true })
  trackingUrl!: string | null;

  @Column({ name: 'label_url', type: 'text', nullable: true })
  labelUrl!: string | null;

  @Column({ name: 'invoice_url', type: 'text', nullable: true })
  invoiceUrl!: string | null;

  @Column({ name: 'pickup_id', type: 'varchar', length: 100, nullable: true })
  pickupId!: string | null;

  @Column({ name: 'warehouse_id', type: 'varchar', length: 50, nullable: true })
  warehouseId!: string | null;

  @Column({ name: 'return_warehouse_id', type: 'varchar', length: 50, nullable: true })
  returnWarehouseId!: string | null;

  // ── Status ───────────────────────────────────────────────────────────────────

  @Index()
  @Column({
    name: 'shipment_status',
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipments_shipment_status_enum',
    default: ShipmentStatus.PENDING,
  })
  shipmentStatus!: ShipmentStatus;

  /** The raw status string as returned by Shipway — stored for debugging. */
  @Column({ name: 'shipway_raw_status', type: 'varchar', length: 100, nullable: true })
  shipwayRawStatus!: string | null;

  // ── Timing ───────────────────────────────────────────────────────────────────

  @Column({ name: 'pushed_at', type: 'timestamptz', nullable: true })
  pushedAt!: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  // ── Idempotency ──────────────────────────────────────────────────────────────

  /**
   * Stores the last processed webhook event_id from Shipway.
   * Used to prevent duplicate webhook processing.
   */
  @Column({ name: 'last_webhook_event_id', type: 'varchar', length: 255, nullable: true })
  lastWebhookEventId!: string | null;

  // ── Relations ────────────────────────────────────────────────────────────────

  @OneToMany(() => ShipmentEventEntity, (event) => event.shipment, { cascade: true })
  events!: ShipmentEventEntity[];
}
