import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorEntity } from '@modules/doctor/entities/doctor.entity';
import { FollowUpPricingMode } from '../enums/follow-up-pricing-mode.enum';

@Entity('consultation_follow_up_policies')
export class ConsultationFollowUpPolicyEntity extends BaseEntity {
  /** Null doctorId = global policy. Uniqueness enforced via partial indexes in migration. */
  @Index('IDX_follow_up_policies_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid', nullable: true })
  doctorId!: string | null;

  @ManyToOne(() => DoctorEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity | null;

  @Column({ name: 'is_global', type: 'boolean', default: false })
  isGlobal!: boolean;

  @Column({ name: 'follow_up_allowed', type: 'boolean', default: true })
  followUpAllowed!: boolean;

  @Column({
    name: 'pricing_mode',
    type: 'enum',
    enum: FollowUpPricingMode,
    enumName: 'follow_up_pricing_mode_enum',
    default: FollowUpPricingMode.FREE,
  })
  pricingMode!: FollowUpPricingMode;

  @Column({ name: 'free_window_days', type: 'int', default: 7 })
  freeWindowDays!: number;

  @Column({
    name: 'paid_fee_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | null) => (value == null ? null : Number(value)),
    },
  })
  paidFeeAmount!: number | null;
}
