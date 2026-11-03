import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorEntity } from '@modules/doctor/entities/doctor.entity';
import { ConsultationPricingType } from '../enums/consultation-pricing-type.enum';
import { FollowUpRecommendationStatus } from '../enums/follow-up-recommendation-status.enum';
import { ConsultationEntity } from './consultation.entity';

@Entity('consultation_follow_up_recommendations')
export class ConsultationFollowUpRecommendationEntity extends BaseEntity {
  @Index('UQ_follow_up_rec_source_consultation', { unique: true })
  @Column({ name: 'source_consultation_id', type: 'uuid' })
  sourceConsultationId!: string;

  @OneToOne(() => ConsultationEntity, (c) => c.followUpRecommendation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_consultation_id' })
  sourceConsultation!: ConsultationEntity;

  @Index('IDX_follow_up_rec_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  instructions!: string | null;

  @Column({ name: 'recommended_from', type: 'date', nullable: true })
  recommendedFrom!: string | null;

  @Column({ name: 'recommended_to', type: 'date', nullable: true })
  recommendedTo!: string | null;

  @Column({ name: 'eligible_until', type: 'timestamptz', nullable: true })
  eligibleUntil!: Date | null;

  @Column({
    name: 'pricing_type',
    type: 'enum',
    enum: ConsultationPricingType,
    enumName: 'consultations_pricing_type_enum',
  })
  pricingType!: ConsultationPricingType;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? 0,
      from: (value?: string | null) => (value == null ? 0 : Number(value)),
    },
  })
  amount!: number;

  @Index('IDX_follow_up_rec_status')
  @Column({
    type: 'enum',
    enum: FollowUpRecommendationStatus,
    enumName: 'follow_up_recommendation_status_enum',
    default: FollowUpRecommendationStatus.OPEN,
  })
  status!: FollowUpRecommendationStatus;

  @Column({ name: 'booked_consultation_id', type: 'uuid', nullable: true })
  bookedConsultationId!: string | null;

  @ManyToOne(() => ConsultationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'booked_consultation_id' })
  bookedConsultation!: ConsultationEntity | null;
}
