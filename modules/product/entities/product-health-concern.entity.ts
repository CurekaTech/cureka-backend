import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ProductEntity } from './product.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';

@Entity('product_health_concerns')
export class ProductHealthConcernEntity {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @PrimaryColumn({ name: 'health_concern_id', type: 'uuid' })
  healthConcernId!: string;

  @Index()
  @ManyToOne('ProductEntity', 'healthConcernMappings', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @ManyToOne(() => HealthConcernEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'health_concern_id' })
  healthConcern!: HealthConcernEntity;
}
