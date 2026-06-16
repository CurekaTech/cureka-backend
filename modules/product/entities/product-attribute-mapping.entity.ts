import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { ProductEntity } from './product.entity';
import { AttributeEntity } from '@modules/master/entities/attribute.entity';

@Entity('product_attribute_mappings')
export class ProductAttributeMappingEntity {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @PrimaryColumn({ name: 'attribute_id', type: 'uuid' })
  attributeId!: string;

  @Index()
  @ManyToOne('ProductEntity', 'attributeMappings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @ManyToOne(() => AttributeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute!: AttributeEntity;
}
