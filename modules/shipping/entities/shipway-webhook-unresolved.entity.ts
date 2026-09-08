import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';

export type ShipwayWebhookUnresolvedOutcome =
  | 'unresolved'
  | 'resolved'
  | 'failed'
  | 'duplicate'
  | 'ignored';

@Entity('shipway_webhook_unresolved')
export class ShipwayWebhookUnresolvedEntity extends BaseEntity {
  @Index()
  @Column({ name: 'payload_order_id', type: 'varchar', length: 100, nullable: true })
  payloadOrderId!: string | null;

  @Index()
  @Column({ name: 'awb_number', type: 'varchar', length: 100, nullable: true })
  awbNumber!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  status!: string | null;

  @Index({ unique: true })
  @Column({ name: 'payload_fingerprint', type: 'varchar', length: 64 })
  payloadFingerprint!: string;

  @Column({ name: 'auth_mode', type: 'varchar', length: 40 })
  authMode!: string;

  @Index()
  @Column({ type: 'varchar', length: 40, default: 'unresolved' })
  outcome!: ShipwayWebhookUnresolvedOutcome;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'sanitized_payload', type: 'jsonb', nullable: true })
  sanitizedPayload!: Record<string, unknown> | null;

  @Column({ name: 'resolved_shipment_id', type: 'uuid', nullable: true })
  resolvedShipmentId!: string | null;

  @Column({ name: 'resolved_order_id', type: 'uuid', nullable: true })
  resolvedOrderId!: string | null;
}
