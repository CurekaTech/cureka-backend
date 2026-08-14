import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionDiscountType } from '../enums/subscription-discount-type.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { ProductSubscriptionConfigEntity } from './product-subscription-config.entity';

@Entity('user_product_subscriptions')
export class UserProductSubscriptionEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'product_variant_id', type: 'uuid' })
  productVariantId!: string;

  @Index()
  @Column({ name: 'address_id', type: 'uuid' })
  addressId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: ProductSubscriptionFrequency,
    enumName: 'product_subscription_frequency_enum',
  })
  frequency!: ProductSubscriptionFrequency;

  @Column({ name: 'subscription_price', type: 'decimal', precision: 12, scale: 2 })
  subscriptionPrice!: string;

  @Column({ name: 'discount_value', type: 'decimal', precision: 12, scale: 2 })
  discountValue!: string;

  @Column({ name: 'final_amount', type: 'decimal', precision: 12, scale: 2 })
  finalAmount!: string;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: SubscriptionDiscountType,
    enumName: 'subscription_discount_type_enum',
  })
  discountType!: SubscriptionDiscountType;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate!: Date | null;

  @Column({ name: 'next_billing_date', type: 'timestamptz', nullable: true })
  nextBillingDate!: Date | null;

  @Column({ name: 'next_delivery_date', type: 'timestamptz', nullable: true })
  nextDeliveryDate!: Date | null;

  @Column({
    type: 'enum',
    enum: ProductSubscriptionStatus,
    enumName: 'product_subscription_status_enum',
    default: ProductSubscriptionStatus.PENDING_PAYMENT,
  })
  status!: ProductSubscriptionStatus;

  @Column({
    name: 'renewal_method',
    type: 'enum',
    enum: SubscriptionRenewalMethod,
    enumName: 'subscription_renewal_method_enum',
    default: SubscriptionRenewalMethod.PAYMENT_LINK,
  })
  renewalMethod!: SubscriptionRenewalMethod;

  @Column({ name: 'payment_gateway', type: 'varchar', length: 100, nullable: true })
  paymentGateway!: string | null;

  @Column({ name: 'gateway_customer_id', type: 'varchar', length: 255, nullable: true })
  gatewayCustomerId!: string | null;

  @Column({ name: 'gateway_subscription_id', type: 'varchar', length: 255, nullable: true })
  gatewaySubscriptionId!: string | null;

  @Column({ name: 'gateway_mandate_id', type: 'varchar', length: 255, nullable: true })
  gatewayMandateId!: string | null;

  @Column({ name: 'cancellation_date', type: 'timestamptz', nullable: true })
  cancellationDate!: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null;

  @Column({ name: 'pause_until', type: 'timestamptz', nullable: true })
  pauseUntil!: Date | null;

  @Column({ name: 'billing_cycle_sequence', type: 'int', default: 0 })
  billingCycleSequence!: number;

  @Index()
  @Column({ name: 'config_id', type: 'uuid', nullable: true })
  configId!: string | null;

  @ManyToOne(() => ProductSubscriptionConfigEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'config_id' })
  config?: ProductSubscriptionConfigEntity | null;
}
