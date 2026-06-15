import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProductVariantEntity } from './product-variant.entity';
import { AttributeEntity } from '@modules/master/entities/attribute.entity';

@Entity('variant_attribute_values')
@Unique('UQ_variant_attribute', ['variantId', 'attributeId'])
export class VariantAttributeValueEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Index()
  @Column({ name: 'attribute_id', type: 'uuid' })
  attributeId!: string;

  @Column({ type: 'varchar', length: 255 })
  value!: string;

  @ManyToOne(() => ProductVariantEntity, (variant) => variant.attributeValues, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariantEntity;

  @ManyToOne(() => AttributeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'attribute_id' })
  attribute!: AttributeEntity;
}
