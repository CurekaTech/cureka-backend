import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { PromotionalOfferReservationStatus } from '../enums/promotional-offer-reservation-status.enum';
import { PromotionalOfferEntity } from './promotional-offer.entity';

@Entity('promotional_offer_reservations')
@Index('UQ_promo_reservation_payment', ['offerId', 'paymentRequestId'], {
  unique: true,
  where: '"payment_request_id" IS NOT NULL',
})
@Index('UQ_promo_reservation_order', ['offerId', 'orderId'], {
  unique: true,
  where: '"order_id" IS NOT NULL',
})
export class PromotionalOfferReservationEntity extends BaseEntity {
  @Index()
  @Column({ name: 'offer_id', type: 'uuid' })
  offerId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'payment_request_id', type: 'uuid', nullable: true })
  paymentRequestId!: string | null;

  @Index()
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({
    type: 'enum',
    enum: PromotionalOfferReservationStatus,
    enumName: 'promotional_offer_reservations_status_enum',
  })
  status!: PromotionalOfferReservationStatus;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount!: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @ManyToOne(() => PromotionalOfferEntity, (offer) => offer.reservations, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'offer_id' })
  offer?: PromotionalOfferEntity;
}
