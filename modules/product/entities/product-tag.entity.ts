import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductTagMappingEntity } from './product-tag-mapping.entity';

@Entity('product_tags')
export class ProductTagEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 300 })
  slug!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @OneToMany(() => ProductTagMappingEntity, (mapping) => mapping.tag)
  productMappings!: ProductTagMappingEntity[];
}
