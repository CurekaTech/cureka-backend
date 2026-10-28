import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, Unique } from 'typeorm';

@Entity('subscription_reminder_logs')
@Unique('UQ_subscription_reminder_logs_cycle_offset_channel', [
  'subscriptionId',
  'billingCycleRef',
  'daysBefore',
  'channel',
])
export class SubscriptionReminderLogEntity extends BaseEntity {
  @Index()
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'billing_cycle_ref', type: 'varchar', length: 64 })
  billingCycleRef!: string;

  @Column({ name: 'days_before', type: 'int' })
  daysBefore!: number;

  @Column({ type: 'varchar', length: 32, default: 'email' })
  channel!: string;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;
}
