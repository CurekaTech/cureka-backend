import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ProductEntity } from './product.entity';
import { CategoryFilterEntity } from '@modules/master/entities/category-filter.entity';

@Entity('product_category_filter_mappings')
export class ProductCategoryFilterMappingEntity {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @PrimaryColumn({ name: 'category_filter_id', type: 'uuid' })
  categoryFilterId!: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  value!: string;

  @Index()
  @ManyToOne('ProductEntity', 'categoryFilterMappings', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Index()
  @ManyToOne(() => CategoryFilterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_filter_id' })
  categoryFilter!: CategoryFilterEntity;
}
