import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { SubscriptionDiscountType } from '../enums/subscription-discount-type.enum';
import { SubscriptionMissedPaymentAction } from '../enums/subscription-missed-payment-action.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';

@Entity('product_subscription_configs')
export class ProductSubscriptionConfigEntity extends BaseEntity {
  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'product_variant_id', type: 'uuid', nullable: true })
  productVariantId!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  frequencies!: ProductSubscriptionFrequency[];

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: SubscriptionDiscountType,
    enumName: 'subscription_discount_type_enum',
  })
  discountType!: SubscriptionDiscountType;

  @Column({ name: 'discount_value', type: 'decimal', precision: 12, scale: 2 })
  discountValue!: string;

  @Column({ name: 'min_duration_months', type: 'int', nullable: true })
  minDurationMonths!: number | null;

  @Column({ name: 'max_duration_months', type: 'int', nullable: true })
  maxDurationMonths!: number | null;

  @Column({ name: 'pause_allowed', type: 'boolean', default: true })
  pauseAllowed!: boolean;

  @Column({ name: 'frequency_change_allowed', type: 'boolean', default: true })
  frequencyChangeAllowed!: boolean;

  @Column({ name: 'cancellation_allowed', type: 'boolean', default: true })
  cancellationAllowed!: boolean;

  @Column({ name: 'skip_allowed', type: 'boolean', default: true })
  skipAllowed!: boolean;

  @Column({ name: 'grace_period_days', type: 'int', default: 7 })
  gracePeriodDays!: number;

  @Column({
    name: 'missed_payment_action',
    type: 'enum',
    enum: SubscriptionMissedPaymentAction,
    enumName: 'subscription_missed_payment_action_enum',
    default: SubscriptionMissedPaymentAction.PAUSE,
  })
  missedPaymentAction!: SubscriptionMissedPaymentAction;

  @Column({
    name: 'renewal_method',
    type: 'enum',
    enum: SubscriptionRenewalMethod,
    enumName: 'subscription_renewal_method_enum',
    default: SubscriptionRenewalMethod.PAYMENT_LINK,
  })
  renewalMethod!: SubscriptionRenewalMethod;

  @Column({
    name: 'reminder_offsets_json',
    type: 'jsonb',
    default: () => "'[7,2,0]'::jsonb",
  })
  reminderOffsetsJson!: number[];

  @Column({ name: 'quantity_change_allowed', type: 'boolean', default: false })
  quantityChangeAllowed!: boolean;

  @Column({ name: 'mandate_max_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  mandateMaxAmount!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone!: string;

  @Column({ name: 'delivery_lead_days', type: 'int', default: 2 })
  deliveryLeadDays!: number;

  @Column({ name: 'max_retry_attempts', type: 'int', default: 3 })
  maxRetryAttempts!: number;

  @Column({ name: 'change_cutoff_hours', type: 'int', default: 12 })
  changeCutoffHours!: number;

  @ManyToOne(() => ProductEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity | null;
}
