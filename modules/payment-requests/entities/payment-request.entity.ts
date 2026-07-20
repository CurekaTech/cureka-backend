import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { UserEntity } from '@modules/users/entities/user.entity';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { PaymentRequestStatus } from '../enums/payment-request-status.enum';
import { PaymentRequestItemEntity } from './payment-request-item.entity';

@Entity('payment_requests')
export class PaymentRequestEntity extends BaseEntity {
  @Index()
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Index()
  @Column({ name: 'address_id', type: 'uuid', nullable: true })
  addressId!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: PaymentRequestStatus,
    enumName: 'payment_requests_status_enum',
    default: PaymentRequestStatus.PAYMENT_PENDING,
  })
  status!: PaymentRequestStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  tax!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  shipping!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  handling!: string;

  @Column({ name: 'platform_fee', type: 'decimal', precision: 12, scale: 2, default: 0 })
  platformFee!: string;

  @Column({ name: 'cod_charge', type: 'decimal', precision: 12, scale: 2, default: 0 })
  codCharge!: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 })
  totalAmount!: string;

  @Column({ name: 'coupon_code', type: 'varchar', length: 100, nullable: true })
  couponCode!: string | null;

  @Column({ name: 'coupon_discount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  couponDiscount!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    name: 'order_source',
    type: 'enum',
    enum: OrderSource,
    enumName: 'orders_order_source_enum',
    default: OrderSource.WEBSITE,
  })
  orderSource!: OrderSource;

  @Column({ name: 'payment_provider', type: 'varchar', length: 50, default: 'RAZORPAY' })
  paymentProvider!: string;

  @Column({ name: 'payment_link', type: 'varchar', length: 500, nullable: true })
  paymentLink!: string | null;

  @Index()
  @Column({ name: 'provider_reference_id', type: 'varchar', length: 100, nullable: true })
  providerReferenceId!: string | null;

  @Column({ name: 'payment_reference', type: 'varchar', length: 100, nullable: true })
  paymentReference!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer?: UserEntity;

  @OneToMany(() => PaymentRequestItemEntity, (item) => item.paymentRequest)
  items!: PaymentRequestItemEntity[];
}
