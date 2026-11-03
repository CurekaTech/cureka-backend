import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Entity('doctor_languages_master')
export class LanguageEntity extends BaseEntity {
  @Index('IDX_doctor_languages_master_name')
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index('UQ_doctor_languages_master_code', { unique: true })
  @Column({ type: 'varchar', length: 16 })
  code!: string;

  @Index('IDX_doctor_languages_master_status')
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'doctor_master_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
