import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';

export type GokwikSyncResourceType = 'product' | 'collection';
export type GokwikSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

@Entity('gokwik_sync_states')
@Index('UQ_gokwik_sync_resource', ['resourceType', 'resourceId'], { unique: true })
export class GokwikSyncStateEntity extends BaseEntity {
  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: GokwikSyncResourceType;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;

  @Column({ name: 'remote_id', type: 'varchar', length: 200, nullable: true })
  remoteId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: GokwikSyncStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt!: Date | null;
}
