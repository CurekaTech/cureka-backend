import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Entity('doctor_specializations_master')
export class SpecializationEntity extends BaseEntity {
  @Index('IDX_doctor_specializations_master_name')
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index('UQ_doctor_specializations_master_slug', { unique: true })
  @Column({ type: 'varchar', length: 280 })
  slug!: string;

  @Index('IDX_doctor_specializations_master_status')
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'doctor_master_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
