import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ShipmentEntity } from './shipment.entity';

/**
 * Records each individual tracking event received from Shipway
 * (via webhook or polling). Provides a full shipment timeline.
 */
@Entity('shipment_events')
export class ShipmentEventEntity extends BaseEntity {
  @Index()
  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  /** Raw status string from Shipway (e.g. "In Transit", "Out for Delivery"). */
  @Column({ name: 'status', type: 'varchar', length: 100 })
  status!: string;

  /** Human-readable description from Shipway. */
  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  /** Location reported by Shipway for this event. */
  @Column({ name: 'location', type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  /** When this event actually occurred (per Shipway data), not when we recorded it. */
  @Index()
  @Column({ name: 'happened_at', type: 'timestamptz', nullable: true })
  happenedAt!: Date | null;

  /** Source: 'webhook' or 'polling' */
  @Column({ name: 'source', type: 'varchar', length: 20, default: 'webhook' })
  source!: string;

  // ── Relation ─────────────────────────────────────────────────────────────────

  @ManyToOne(() => ShipmentEntity, (shipment) => shipment.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id' })
  shipment?: ShipmentEntity;
}
