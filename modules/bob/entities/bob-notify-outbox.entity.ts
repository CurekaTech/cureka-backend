import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';

export type BobNotifyOutboxStatus =
  | 'pending'
  | 'sending'
  | 'accepted'
  | 'failed'
  | 'ambiguous'
  | 'suppressed'
  | 'skipped';

@Entity('bob_notify_outbox')
export class BobNotifyOutboxEntity extends BaseEntity {
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'order_number', type: 'varchar', length: 30 })
  orderNumber!: string;

  @Column({ name: 'shipment_id', type: 'uuid', nullable: true })
  shipmentId!: string | null;

  @Column({ name: 'notification_kind', type: 'varchar', length: 60 })
  notificationKind!: string;

  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey!: string;

  @Index()
  @Column({ type: 'varchar', length: 40, default: 'pending' })
  status!: BobNotifyOutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_http_status', type: 'int', nullable: true })
  lastHttpStatus!: number | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  /** Worker claim lease for PM2-safe sending. */
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'claim_token', type: 'varchar', length: 64, nullable: true })
  claimToken!: string | null;

  @Column({ name: 'payload_snapshot', type: 'jsonb', nullable: true })
  payloadSnapshot!: Record<string, unknown> | null;
}
