import {

  Column,

  CreateDateColumn,

  DeleteDateColumn,

  Entity,

  Index,

  JoinColumn,

  ManyToOne,

  OneToMany,

  PrimaryGeneratedColumn,

  UpdateDateColumn,

} from 'typeorm';

import { ProductEntity } from './product.entity';

import { VariantStatus } from '../enums/variant-status.enum';

import { VariantAttributeValueEntity } from './variant-attribute-value.entity';

import { ProductMediaEntity } from './product-media.entity';



@Entity('product_variants')

export class ProductVariantEntity {

  @PrimaryGeneratedColumn('uuid')

  id!: string;



  @Index()

  @Column({ name: 'product_id', type: 'uuid' })

  productId!: string;



  @Index()

  @Column({ type: 'varchar', length: 100 })

  sku!: string;



  @Index()

  @Column({ type: 'varchar', length: 500 })

  slug!: string;



  @Index()

  @Column({ name: 'external_product_id', type: 'varchar', length: 255, nullable: true })

  externalProductId!: string | null;



  @Index()

  @Column({ name: 'vendor_sku', type: 'varchar', length: 100, nullable: true })

  vendorSku!: string | null;



  @Column({ type: 'varchar', length: 100, nullable: true })

  barcode!: string | null;



  @Column({ name: 'gtin_number', type: 'varchar', length: 100, nullable: true })

  gtinNumber!: string | null;



  @Column({ name: 'hsn_code', type: 'varchar', length: 50, nullable: true })

  hsnCode!: string | null;



  @Column({ name: 'batch_number', type: 'varchar', length: 100, nullable: true })

  batchNumber!: string | null;



  @Column({ name: 'expiry_date', type: 'date', nullable: true })

  expiryDate!: string | null;



  @Column({ type: 'decimal', precision: 12, scale: 2 })

  mrp!: string;



  @Column({ name: 'selling_price', type: 'decimal', precision: 12, scale: 2 })

  sellingPrice!: string;



  @Column({ name: 'discount_percentage', type: 'decimal', precision: 5, scale: 2, nullable: true })

  discountPercentage!: string | null;



  @Column({ type: 'int', default: 0 })

  stock!: number;



  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })

  weight!: string | null;



  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })

  length!: string | null;



  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })

  width!: string | null;



  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })

  height!: string | null;



  @Column({ name: 'weight_unit', type: 'varchar', length: 100, nullable: true })

  weightUnit!: string | null;



  @Column({ name: 'length_unit', type: 'varchar', length: 100, nullable: true })

  lengthUnit!: string | null;



  @Column({ name: 'width_unit', type: 'varchar', length: 100, nullable: true })

  widthUnit!: string | null;



  @Column({ name: 'height_unit', type: 'varchar', length: 100, nullable: true })

  heightUnit!: string | null;



  @Column({ name: 'expires_in', type: 'int', nullable: true })

  expiresIn!: number | null;



  @Column({ name: 'tax_class', type: 'varchar', length: 100, nullable: true })

  taxClass!: string | null;



  @Index()

  @Column({

    type: 'enum',

    enum: VariantStatus,

    enumName: 'product_variants_status_enum',

    default: VariantStatus.ACTIVE,

  })

  status!: VariantStatus;



  /** Normalized combination key for duplicate detection within a product. */

  @Index()

  @Column({ name: 'combination_key', type: 'varchar', length: 500, nullable: true })

  combinationKey!: string | null;



  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })

  createdAt!: Date;



  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })

  updatedAt!: Date;



  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })

  deletedAt?: Date;



  @ManyToOne(() => ProductEntity, (product) => product.variants, { onDelete: 'CASCADE' })

  @JoinColumn({ name: 'product_id' })

  product!: ProductEntity;



  @OneToMany(() => VariantAttributeValueEntity, (value) => value.variant)

  attributeValues!: VariantAttributeValueEntity[];



  @OneToMany(() => ProductMediaEntity, (media) => media.variant)

  media!: ProductMediaEntity[];

}


