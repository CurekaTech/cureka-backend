import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorEntity } from './doctor.entity';
import { LanguageEntity } from './language.entity';

@Entity('doctor_language_maps')
@Unique('UQ_doctor_language_maps_pair', ['doctorId', 'languageId'])
export class DoctorLanguageMapEntity extends BaseEntity {
  @Index('IDX_doctor_language_maps_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, (doctor) => doctor.languages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('IDX_doctor_language_maps_language_id')
  @Column({ name: 'language_id', type: 'uuid' })
  languageId!: string;

  @ManyToOne(() => LanguageEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'language_id' })
  language!: LanguageEntity;
}
