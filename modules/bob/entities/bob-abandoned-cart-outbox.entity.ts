import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';
import { BobNotifyOutboxStatus } from './bob-notify-outbox.entity';

@Entity('bob_abandoned_cart_outbox')
export class BobAbandonedCartOutboxEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @Column({ name: 'cart_ref_id', type: 'varchar', length: 30 })
  cartRefId!: string;

  /** Canonical 10-digit Indian mobile used for 24h phone-level dedupe. */
  @Index()
  @Column({ name: 'destination_phone_normalized', type: 'varchar', length: 20 })
  destinationPhoneNormalized!: string;

  @Column({ name: 'notification_kind', type: 'varchar', length: 60, default: 'abandoned-cart' })
  notificationKind!: string;

  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey!: string;

  @Column({ name: 'job_id', type: 'varchar', length: 160, nullable: true })
  jobId!: string | null;

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

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'claim_token', type: 'varchar', length: 64, nullable: true })
  claimToken!: string | null;

  @Column({ name: 'payload_snapshot', type: 'jsonb', nullable: true })
  payloadSnapshot!: Record<string, unknown> | null;
}
