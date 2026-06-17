import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('wellness_goals')
export class WellnessGoalEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
