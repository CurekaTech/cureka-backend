import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductEntity } from './product.entity';
import { ProductVariantEntity } from './product-variant.entity';
import { ProductMediaType } from '../enums/product-media-type.enum';

@Entity('product_media')
export class ProductMediaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId!: string | null;

  @Column({
    type: 'enum',
    enum: ProductMediaType,
    enumName: 'product_media_type_enum',
  })
  type!: ProductMediaType;

  @Column({ type: 'varchar', length: 1000 })
  url!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ProductEntity, (product) => product.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, (variant) => variant.media, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariantEntity | null;
}
