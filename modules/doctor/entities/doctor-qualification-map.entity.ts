import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorEntity } from './doctor.entity';
import { QualificationEntity } from './qualification.entity';

@Entity('doctor_qualification_maps')
@Unique('UQ_doctor_qualification_maps_pair', ['doctorId', 'qualificationId'])
export class DoctorQualificationMapEntity extends BaseEntity {
  @Index('IDX_doctor_qualification_maps_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, (doctor) => doctor.qualifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('IDX_doctor_qualification_maps_qualification_id')
  @Column({ name: 'qualification_id', type: 'uuid' })
  qualificationId!: string;

  @ManyToOne(() => QualificationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'qualification_id' })
  qualification!: QualificationEntity;
}
