import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';
import { SubscriptionHistoryAction } from '../enums/subscription-history-action.enum';

@Entity('subscription_status_history')
export class SubscriptionStatusHistoryEntity extends BaseEntity {
  @Index()
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({
    type: 'enum',
    enum: SubscriptionHistoryAction,
    enumName: 'subscription_history_action_enum',
  })
  action!: SubscriptionHistoryAction;

  @Column({ name: 'from_status', type: 'varchar', length: 64, nullable: true })
  fromStatus!: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 64, nullable: true })
  toStatus!: string | null;

  @Column({ name: 'performed_by', type: 'varchar', length: 255 })
  performedBy!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;
}
