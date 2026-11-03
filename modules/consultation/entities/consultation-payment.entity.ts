import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ConsultationPaymentStatus } from '../enums/consultation-payment-status.enum';
import { ConsultationEntity } from './consultation.entity';

@Entity('consultation_payments')
export class ConsultationPaymentEntity extends BaseEntity {
  @Index('UQ_consultation_payments_consultation_id', { unique: true })
  @Column({ name: 'consultation_id', type: 'uuid' })
  consultationId!: string;

  @OneToOne(() => ConsultationEntity, (c) => c.payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consultation_id' })
  consultation!: ConsultationEntity;

  @Column({ type: 'varchar', length: 40 })
  provider!: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: {
      to: (value?: number | null) => value ?? 0,
      from: (value?: string | null) => (value == null ? 0 : Number(value)),
    },
  })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency!: string;

  @Index('IDX_consultation_payments_status')
  @Column({
    type: 'enum',
    enum: ConsultationPaymentStatus,
    enumName: 'consultations_payment_status_enum',
    default: ConsultationPaymentStatus.PENDING,
  })
  status!: ConsultationPaymentStatus;

  @Index('UQ_consultation_payments_gateway_payment_id', { unique: true })
  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 120, nullable: true })
  gatewayPaymentId!: string | null;

  @Column({ name: 'gateway_order_id', type: 'varchar', length: 120, nullable: true })
  gatewayOrderId!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 120, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt!: Date | null;
}
