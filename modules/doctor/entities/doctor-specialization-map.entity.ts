import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorEntity } from './doctor.entity';
import { SpecializationEntity } from './specialization.entity';

@Entity('doctor_specialization_maps')
@Unique('UQ_doctor_specialization_maps_pair', ['doctorId', 'specializationId'])
export class DoctorSpecializationMapEntity extends BaseEntity {
  @Index('IDX_doctor_specialization_maps_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, (doctor) => doctor.specializations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('IDX_doctor_specialization_maps_specialization_id')
  @Column({ name: 'specialization_id', type: 'uuid' })
  specializationId!: string;

  @ManyToOne(() => SpecializationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'specialization_id' })
  specialization!: SpecializationEntity;
}
