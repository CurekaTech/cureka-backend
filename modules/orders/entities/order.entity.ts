import { BaseEntity } from '@packages/database';
import { UserEntity } from '@modules/users/entities/user.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderSource } from '../enums/order-source.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItemEntity } from './order-item.entity';

@Entity('orders')
export class OrderEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'order_number', type: 'varchar', length: 30 })
  orderNumber!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount!: string;

  @Column({ name: 'shipping_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  shippingAmount!: string;

  @Column({ name: 'handling_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  handlingAmount!: string;

  @Column({ name: 'platform_fee', type: 'decimal', precision: 12, scale: 2, default: 0 })
  platformFee!: string;

  @Column({ name: 'cod_charge', type: 'decimal', precision: 12, scale: 2, default: 0 })
  codCharge!: string;

  @Column({ name: 'prepaid_discount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  prepaidDiscount!: string;

  @Column({ name: 'grand_total', type: 'decimal', precision: 12, scale: 2 })
  grandTotal!: string;

  @Index()
  @Column({ name: 'coupon_id', type: 'uuid', nullable: true })
  couponId!: string | null;

  @Column({ name: 'coupon_code', type: 'varchar', length: 100, nullable: true })
  couponCode!: string | null;

  @Column({ name: 'coupon_title', type: 'varchar', length: 255, nullable: true })
  couponTitle!: string | null;

  @Column({ name: 'coupon_discount_type', type: 'varchar', length: 20, nullable: true })
  couponDiscountType!: string | null;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: OrderPaymentMethod,
    enumName: 'orders_payment_method_enum',
  })
  paymentMethod!: OrderPaymentMethod;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: OrderPaymentStatus,
    enumName: 'orders_payment_status_enum',
    default: OrderPaymentStatus.PENDING,
  })
  paymentStatus!: OrderPaymentStatus;

  @Index()
  @Column({
    name: 'order_status',
    type: 'enum',
    enum: OrderStatus,
    enumName: 'orders_order_status_enum',
    default: OrderStatus.PENDING,
  })
  orderStatus!: OrderStatus;

  // Source of the order (Admin, Website, App, Gokwik)
  @Index()
  @Column({
    name: 'order_source',
    type: 'enum',
    enum: OrderSource,
    enumName: 'orders_order_source_enum',
    default: OrderSource.WEBSITE,
  })
  orderSource!: OrderSource;

  @Column({ name: 'recipient_name', type: 'varchar', length: 150 })
  recipientName!: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 10 })
  phoneNumber!: string;

  @Column({ type: 'varchar', length: 6 })
  pincode!: string;

  @Column({ name: 'address_line1', type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  landmark!: string | null;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100 })
  state!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @Index()
  @Column({ name: 'placed_at', type: 'timestamptz', nullable: true })
  placedAt!: Date | null;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @OneToMany(() => OrderItemEntity, (item) => item.order)
  items!: OrderItemEntity[];
}
