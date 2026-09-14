import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ReturnPickupProvider } from '../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnRequestEntity } from './return-request.entity';

/**
 * Provider-independent reverse-pickup record. Approval writes Unicommerce and
 * Shipway identifiers into provider_payload; MANUAL rows are ops-entered AWBs.
 */
@Entity('return_pickups')
export class ReturnPickupEntity extends BaseEntity {
  /** One active pickup per return; enforced by a partial unique index. */
  @Index('IDX_return_pickups_return_request_id')
  @Column({ name: 'return_request_id', type: 'uuid' })
  returnRequestId!: string;

  @ManyToOne(() => ReturnRequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest?: ReturnRequestEntity;

  @Column({
    type: 'enum',
    enum: ReturnPickupProvider,
    enumName: 'return_pickups_provider_enum',
    default: ReturnPickupProvider.MANUAL,
  })
  provider!: ReturnPickupProvider;

  @Index('IDX_return_pickups_status')
  @Column({
    type: 'enum',
    enum: ReturnPickupStatus,
    enumName: 'return_pickups_status_enum',
    default: ReturnPickupStatus.SCHEDULED,
  })
  status!: ReturnPickupStatus;

  @Index('IDX_return_pickups_reverse_awb_number')
  @Column({ name: 'reverse_awb_number', type: 'varchar', length: 100, nullable: true })
  reverseAwbNumber!: string | null;

  @Column({ name: 'provider_pickup_id', type: 'varchar', length: 100, nullable: true })
  providerPickupId!: string | null;

  @Column({ name: 'courier_name', type: 'varchar', length: 255, nullable: true })
  courierName!: string | null;

  @Column({ name: 'tracking_url', type: 'text', nullable: true })
  trackingUrl!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true })
  pickedUpAt!: Date | null;

  @Column({ name: 'delivered_at_warehouse_at', type: 'timestamptz', nullable: true })
  deliveredAtWarehouseAt!: Date | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'last_event_at', type: 'timestamptz', nullable: true })
  lastEventAt!: Date | null;

  @Column({ name: 'last_event_status', type: 'varchar', length: 120, nullable: true })
  lastEventStatus!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  /**
   * Last processed provider event key. Reverse-logistics webhooks are retried and
   * can arrive out of order, so writes are skipped when this key repeats.
   */
  @Column({ name: 'last_event_key', type: 'varchar', length: 255, nullable: true })
  lastEventKey!: string | null;

  @Column({ name: 'provider_payload', type: 'jsonb', nullable: true })
  providerPayload!: Record<string, unknown> | null;
}
