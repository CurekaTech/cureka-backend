import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ProductTagMappingEntity } from './product-tag-mapping.entity';

@Entity('product_tags')
export class ProductTagEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 300 })
  slug!: string;

  @OneToMany(() => ProductTagMappingEntity, (mapping) => mapping.tag)
  productMappings!: ProductTagMappingEntity[];
}
