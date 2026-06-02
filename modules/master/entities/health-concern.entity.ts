import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('health_concerns')
export class HealthConcernEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  icon!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 300 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  banner!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
