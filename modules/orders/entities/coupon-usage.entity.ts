import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { OrderEntity } from './order.entity';

@Entity('coupon_usages')
export class CouponUsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'coupon_id', type: 'uuid' })
  couponId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2 })
  discountAmount!: string;

  @CreateDateColumn({ name: 'used_at', type: 'timestamptz' })
  usedAt!: Date;

  @ManyToOne(() => CouponEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coupon_id' })
  coupon?: CouponEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToOne(() => OrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;
}
