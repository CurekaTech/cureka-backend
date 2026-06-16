import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { SubscriptionFrequencyUnit } from '../enums/subscription-frequency-unit.enum';

@Entity('subscription_frequencies')
export class SubscriptionFrequencyEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'integer' })
  value!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: SubscriptionFrequencyUnit,
    enumName: 'subscription_frequencies_unit_enum',
  })
  unit!: SubscriptionFrequencyUnit;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
