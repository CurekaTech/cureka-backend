import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { ProductVariantEntity } from './product-variant.entity';
import type { PincodeEntity } from '@modules/pincodes/entities/pincode.entity';

@Entity('product_variant_pincodes')
@Unique('UQ_product_variant_pincodes_variant_pincode', ['productVariantId', 'pincodeId'])
@Index('IDX_product_variant_pincodes_pincode_variant', ['pincodeId', 'productVariantId'])
export class ProductVariantPincodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'product_variant_id', type: 'uuid' })
  productVariantId!: string;

  @Index()
  @Column({ name: 'pincode_id', type: 'uuid' })
  pincodeId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('ProductVariantEntity', 'pincodeMappings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_variant_id' })
  variant?: ProductVariantEntity;

  @ManyToOne('PincodeEntity', 'variantMappings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pincode_id' })
  pincode?: PincodeEntity;
}
