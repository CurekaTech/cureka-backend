import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { UserEntity } from '@modules/users/entities/user.entity';

@Entity('website_experience_reviews')
@Index('IDX_website_experience_reviews_user_id', ['userId'])
export class WebsiteExperienceReviewEntity extends BaseEntity {
  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId!: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: OrderEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'order_number', type: 'varchar', length: 30 })
  orderNumber!: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 200 })
  customerName!: string;

  @Column({ name: 'customer_email', type: 'varchar', length: 255, nullable: true })
  customerEmail!: string | null;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  feedback!: string | null;
}
