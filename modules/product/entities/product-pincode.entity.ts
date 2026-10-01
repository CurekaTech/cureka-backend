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
import type { ProductEntity } from './product.entity';
import type { PincodeEntity } from '@modules/pincodes/entities/pincode.entity';

@Entity('product_pincodes')
@Unique('UQ_product_pincodes_product_pincode', ['productId', 'pincodeId'])
@Index('IDX_product_pincodes_pincode_product', ['pincodeId', 'productId'])
export class ProductPincodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'pincode_id', type: 'uuid' })
  pincodeId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('ProductEntity', 'pincodeMappings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne('PincodeEntity', 'productMappings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pincode_id' })
  pincode?: PincodeEntity;
}
