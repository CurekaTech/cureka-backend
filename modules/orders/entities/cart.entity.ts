import { BaseEntity } from '@packages/database';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { UserEntity } from '@modules/users/entities/user.entity';
import { OrderSource } from '../enums/order-source.enum';
import { CartItemEntity } from './cart-item.entity';

@Entity('carts')
export class CartEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Index()
  @Column({ name: 'coupon_id', type: 'uuid', nullable: true })
  couponId!: string | null;

  /**
   * Sticky storefront source from validate/checkout (`App` | `Website`).
   * Used when place-order / payment-requests/checkout omit `orderSource`.
   */
  @Column({
    name: 'order_source',
    type: 'enum',
    enum: OrderSource,
    enumName: 'orders_order_source_enum',
    nullable: true,
  })
  orderSource!: OrderSource | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToOne(() => CouponEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'coupon_id' })
  coupon?: CouponEntity | null;

  @OneToMany(() => CartItemEntity, (item: CartItemEntity) => item.cart)
  items!: CartItemEntity[];
}
