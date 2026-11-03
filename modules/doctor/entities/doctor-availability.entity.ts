import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorClinicAssociationEntity } from './doctor-clinic-association.entity';
import { DoctorEntity } from './doctor.entity';

@Entity('doctor_availabilities')
export class DoctorAvailabilityEntity extends BaseEntity {
  @Index('IDX_doctor_availabilities_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('IDX_doctor_availabilities_clinic_id')
  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId!: string;

  @ManyToOne(() => DoctorClinicAssociationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic!: DoctorClinicAssociationEntity;

  /** 0=Sunday .. 6=Saturday */
  @Column({ name: 'weekday', type: 'smallint' })
  weekday!: number;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
