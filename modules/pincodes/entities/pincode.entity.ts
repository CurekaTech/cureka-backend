import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { PincodeOfficeEntity } from './pincode-office.entity';
import type { ProductVariantPincodeEntity } from '@modules/product/entities/product-variant-pincode.entity';

/** One row per 6-digit Indian pincode. Product mappings point here, not at a post office. */
@Entity('pincodes')
export class PincodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 6 })
  pincode!: string;

  /** Representative district (most common post office). Exposed to clients as city. */
  @Column({ type: 'varchar', length: 255, default: '' })
  district!: string;

  @Column({ name: 'statename', type: 'varchar', length: 255, default: '' })
  stateName!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany('PincodeOfficeEntity', 'pincode')
  offices?: PincodeOfficeEntity[];

  @OneToMany('ProductVariantPincodeEntity', 'pincode')
  variantMappings?: ProductVariantPincodeEntity[];
}
