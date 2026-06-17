import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ProductEntity } from './product.entity';
import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';

@Entity('product_wellness_goals')
export class ProductWellnessGoalEntity {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @PrimaryColumn({ name: 'wellness_goal_id', type: 'uuid' })
  wellnessGoalId!: string;

  @Index()
  @ManyToOne('ProductEntity', 'wellnessGoalMappings', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @ManyToOne(() => WellnessGoalEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wellness_goal_id' })
  wellnessGoal!: WellnessGoalEntity;
}
