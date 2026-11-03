import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorClinicAssociationEntity } from '@modules/doctor/entities/doctor-clinic-association.entity';
import { DoctorEntity } from '@modules/doctor/entities/doctor.entity';
import { DoctorSlotEntity } from '@modules/doctor/entities/doctor-slot.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { ConsultationAttendanceStatus } from '../enums/consultation-attendance-status.enum';
import { ConsultationPaymentStatus } from '../enums/consultation-payment-status.enum';
import { ConsultationPricingType } from '../enums/consultation-pricing-type.enum';
import { ConsultationStatus } from '../enums/consultation-status.enum';
import { ConsultationDocumentEntity } from './consultation-document.entity';
import { ConsultationFollowUpRecommendationEntity } from './consultation-follow-up-recommendation.entity';
import { ConsultationPaymentEntity } from './consultation-payment.entity';
import { ConsultationStatusHistoryEntity } from './consultation-status-history.entity';
import { PrescriptionEntity } from './prescription.entity';

@Entity('consultations')
export class ConsultationEntity extends BaseEntity {
  @Index('IDX_consultations_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer!: UserEntity;

  @Index('IDX_consultations_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('IDX_consultations_clinic_id')
  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId!: string;

  @ManyToOne(() => DoctorClinicAssociationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clinic_id' })
  clinic!: DoctorClinicAssociationEntity;

  @Index('IDX_consultations_slot_id')
  @Column({ name: 'slot_id', type: 'uuid', nullable: true })
  slotId!: string | null;

  @ManyToOne(() => DoctorSlotEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'slot_id' })
  slot!: DoctorSlotEntity | null;

  @Index('IDX_consultations_parent_id')
  @Column({ name: 'parent_consultation_id', type: 'uuid', nullable: true })
  parentConsultationId!: string | null;

  @ManyToOne(() => ConsultationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_consultation_id' })
  parentConsultation!: ConsultationEntity | null;

  @Column({ name: 'is_follow_up', type: 'boolean', default: false })
  isFollowUp!: boolean;

  @Index('IDX_consultations_status')
  @Column({
    type: 'enum',
    enum: ConsultationStatus,
    enumName: 'consultations_status_enum',
    default: ConsultationStatus.DRAFT,
  })
  status!: ConsultationStatus;

  @Column({
    name: 'pricing_type',
    type: 'enum',
    enum: ConsultationPricingType,
    enumName: 'consultations_pricing_type_enum',
  })
  pricingType!: ConsultationPricingType;

  @Column({
    name: 'amount_charged',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? 0,
      from: (value?: string | null) => (value == null ? 0 : Number(value)),
    },
  })
  amountCharged!: number;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: ConsultationPaymentStatus,
    enumName: 'consultations_payment_status_enum',
    default: ConsultationPaymentStatus.NONE,
  })
  paymentStatus!: ConsultationPaymentStatus;

  @Column({ type: 'text', nullable: true })
  symptoms!: string | null;

  @Column({ name: 'patient_name', type: 'varchar', length: 255 })
  patientName!: string;

  @Column({ name: 'patient_mobile', type: 'varchar', length: 20 })
  patientMobile!: string;

  @Column({ name: 'scheduled_start', type: 'timestamptz' })
  scheduledStart!: Date;

  @Column({ name: 'scheduled_end', type: 'timestamptz' })
  scheduledEnd!: Date;

  @Column({ name: 'venue_snapshot', type: 'jsonb', nullable: true })
  venueSnapshot!: Record<string, unknown> | null;

  @Column({
    name: 'attendance_status',
    type: 'enum',
    enum: ConsultationAttendanceStatus,
    enumName: 'consultations_attendance_status_enum',
    default: ConsultationAttendanceStatus.PENDING,
  })
  attendanceStatus!: ConsultationAttendanceStatus;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'diagnosis', type: 'text', nullable: true })
  diagnosis!: string | null;

  @Column({ name: 'tnc_accepted_at', type: 'timestamptz', nullable: true })
  tncAcceptedAt!: Date | null;

  @Column({ name: 'otp_verified_at', type: 'timestamptz', nullable: true })
  otpVerifiedAt!: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @OneToMany(() => ConsultationDocumentEntity, (doc) => doc.consultation)
  documents?: ConsultationDocumentEntity[];

  @OneToMany(() => ConsultationStatusHistoryEntity, (row) => row.consultation)
  statusHistory?: ConsultationStatusHistoryEntity[];

  @OneToOne(() => ConsultationPaymentEntity, (payment) => payment.consultation)
  payment?: ConsultationPaymentEntity;

  @OneToOne(() => PrescriptionEntity, (rx) => rx.consultation)
  prescription?: PrescriptionEntity;

  @OneToOne(() => ConsultationFollowUpRecommendationEntity, (rec) => rec.sourceConsultation)
  followUpRecommendation?: ConsultationFollowUpRecommendationEntity;
}
