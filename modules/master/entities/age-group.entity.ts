import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('age_groups')
export class AgeGroupEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'from_years', type: 'int' })
  fromYears!: number;

  @Column({ name: 'from_months', type: 'int' })
  fromMonths!: number;

  @Column({ name: 'to_years', type: 'int' })
  toYears!: number;

  @Column({ name: 'to_months', type: 'int' })
  toMonths!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
