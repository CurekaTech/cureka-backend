import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorConsultationMode } from '../enums/doctor-consultation-mode.enum';
import { DoctorPricingType } from '../enums/doctor-pricing-type.enum';
import { DoctorEntity } from './doctor.entity';

@Entity('doctor_consultation_configs')
export class DoctorConsultationConfigEntity extends BaseEntity {
  @Index('UQ_doctor_consultation_configs_doctor_id', { unique: true })
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @OneToOne(() => DoctorEntity, (doctor) => doctor.consultationConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Column({
    name: 'pricing_type',
    type: 'enum',
    enum: DoctorPricingType,
    enumName: 'doctor_consultation_configs_pricing_type_enum',
    default: DoctorPricingType.PAID,
  })
  pricingType!: DoctorPricingType;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | null) => (value == null ? null : Number(value)),
    },
  })
  amount!: number | null;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency!: string;

  @Column({ name: 'duration_minutes', type: 'int', default: 30 })
  durationMinutes!: number;

  @Column({ name: 'buffer_minutes', type: 'int', default: 0 })
  bufferMinutes!: number;

  @Column({ name: 'max_per_day', type: 'int', nullable: true })
  maxPerDay!: number | null;

  @Column({ name: 'advance_window_days', type: 'int', default: 30 })
  advanceWindowDays!: number;

  @Column({ name: 'same_day_cutoff_minutes', type: 'int', nullable: true })
  sameDayCutoffMinutes!: number | null;

  @Column({
    name: 'enabled_modes',
    type: 'jsonb',
    default: () => `'["OFFLINE"]'`,
  })
  enabledModes!: DoctorConsultationMode[];
}
