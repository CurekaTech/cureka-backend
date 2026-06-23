import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { UserEntity } from '@modules/users/entities/user.entity';
import { CartItemEntity } from './cart-item.entity';
// import { CartItemEntity } from './cart-item.entity';

@Entity('carts')
export class CartEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @OneToMany(() => CartItemEntity, (item: CartItemEntity) => item.cart)
  items!: CartItemEntity[];
}
