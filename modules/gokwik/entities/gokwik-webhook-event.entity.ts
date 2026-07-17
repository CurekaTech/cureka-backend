import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';

export type GokwikWebhookProcessingStatus = 'received' | 'processed' | 'ignored' | 'failed';

@Entity('gokwik_webhook_events')
export class GokwikWebhookEventEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'event_key', type: 'varchar', length: 500 })
  eventKey!: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  entity!: string;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  event!: string;

  @Column({ name: 'provider_reference_id', type: 'varchar', length: 200, nullable: true })
  providerReferenceId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'received' })
  status!: GokwikWebhookProcessingStatus;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;
}
