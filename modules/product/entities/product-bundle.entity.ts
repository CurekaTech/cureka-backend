import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProductEntity } from './product.entity';
import { ProductVariantEntity } from './product-variant.entity';

@Entity('product_bundles')
@Unique('UQ_product_bundle_child', ['parentProductId', 'childProductId'])
export class ProductBundleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'parent_product_id', type: 'uuid' })
  parentProductId!: string;

  @Index()
  @Column({ name: 'child_product_id', type: 'uuid' })
  childProductId!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  /** Variant chosen for this child product. Null on rows saved before variant selection. */
  @Index()
  @Column({ name: 'child_variant_id', type: 'uuid', nullable: true })
  childVariantId!: string | null;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'child_variant_id' })
  childVariant?: ProductVariantEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ProductEntity, (product) => product.bundleItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_product_id' })
  parentProduct!: ProductEntity;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'child_product_id' })
  childProduct!: ProductEntity;
}
