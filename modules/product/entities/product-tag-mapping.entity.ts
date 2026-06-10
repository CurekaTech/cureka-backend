import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ProductEntity } from './product.entity';
import { ProductTagEntity } from './product-tag.entity';

@Entity('product_tag_mappings')
export class ProductTagMappingEntity {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @PrimaryColumn({ name: 'tag_id', type: 'uuid' })
  tagId!: string;

  @Index()
  @ManyToOne(() => ProductEntity, (product) => product.tagMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @ManyToOne(() => ProductTagEntity, (tag) => tag.productMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag!: ProductTagEntity;
}
