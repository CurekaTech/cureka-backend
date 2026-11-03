import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Entity('doctor_qualifications_master')
export class QualificationEntity extends BaseEntity {
  @Index('UQ_doctor_qualifications_master_name', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index('IDX_doctor_qualifications_master_status')
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'doctor_master_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
