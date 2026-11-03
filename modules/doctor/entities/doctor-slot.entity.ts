import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorSlotStatus } from '../enums/doctor-slot-status.enum';
import { DoctorClinicAssociationEntity } from './doctor-clinic-association.entity';
import { DoctorEntity } from './doctor.entity';

@Entity('doctor_slots')
@Unique('UQ_doctor_slots_doctor_start', ['doctorId', 'startAt'])
export class DoctorSlotEntity extends BaseEntity {
  @Index('IDX_doctor_slots_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('IDX_doctor_slots_clinic_id')
  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId!: string;

  @ManyToOne(() => DoctorClinicAssociationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic!: DoctorClinicAssociationEntity;

  @Index('IDX_doctor_slots_start_at')
  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @Index('IDX_doctor_slots_status')
  @Column({
    type: 'enum',
    enum: DoctorSlotStatus,
    enumName: 'doctor_slots_status_enum',
    default: DoctorSlotStatus.OPEN,
  })
  status!: DoctorSlotStatus;

  @Column({ name: 'hold_expires_at', type: 'timestamptz', nullable: true })
  holdExpiresAt!: Date | null;

  @Column({ name: 'held_by_consultation_id', type: 'uuid', nullable: true })
  heldByConsultationId!: string | null;
}
