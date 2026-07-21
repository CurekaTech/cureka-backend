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
import { IProductInformationItem } from '../interfaces/product-information.interface';
import { IProductPackMetadataItem } from '../interfaces/product-pack-metadata.interface';
import { IVariantInlineFaq, IVariantCategoryFilterBinding } from '../interfaces/variant-details.interface';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { ManufacturerEntity } from '@modules/master/entities/manufacturer.entity';
import { PackerEntity } from '@modules/master/entities/packer.entity';
import { ImporterEntity } from '@modules/master/entities/importer.entity';
import { CountryEntity } from '@modules/master/entities/country.entity';



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

  @Column({ name: 'display_name', type: 'varchar', length: 500, nullable: true })
  displayName!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'product_information', type: 'jsonb', nullable: false, default: () => "'[]'" })
  productInformation!: IProductInformationItem[];

  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'" })
  faqs!: IVariantInlineFaq[];

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'meta_keywords', type: 'jsonb', nullable: true })
  metaKeywords!: string[] | null;

  @Column({ type: 'text', nullable: true })
  components!: string | null;

  @Column({ name: 'subscription_enabled', type: 'boolean', default: false })
  subscriptionEnabled!: boolean;

  @Column({ name: 'cod_available', type: 'boolean', default: false })
  codAvailable!: boolean;

  @Column({ name: 'emi_available', type: 'boolean', default: false })
  emiAvailable!: boolean;

  @Column({ name: 'return_allowed', type: 'boolean', default: false })
  returnAllowed!: boolean;

  @Column({ name: 'return_policy', type: 'text', nullable: true })
  returnPolicy!: string | null;

  @Column({ name: 'return_window_days', type: 'int', nullable: true })
  returnWindowDays!: number | null;

  @Column({ name: 'replace_allowed', type: 'boolean', default: false })
  replaceAllowed!: boolean;

  @Column({ name: 'replace_window_days', type: 'int', nullable: true })
  replaceWindowDays!: number | null;

  @Index()
  @Column({ name: 'manufacturer_id', type: 'uuid', nullable: true })
  manufacturerId!: string | null;

  @Index()
  @Column({ name: 'packer_id', type: 'uuid', nullable: true })
  packerId!: string | null;

  @Index()
  @Column({ name: 'importer_id', type: 'uuid', nullable: true })
  importerId!: string | null;

  @Column({ name: 'manufacturer_address', type: 'text', nullable: true })
  manufacturerAddress!: string | null;

  @Column({ name: 'packer_address', type: 'text', nullable: true })
  packerAddress!: string | null;

  @Column({ name: 'importer_address', type: 'text', nullable: true })
  importerAddress!: string | null;

  @Index()
  @Column({ name: 'country_of_origin_id', type: 'uuid', nullable: true })
  countryOfOriginId!: string | null;

  @Column({ name: 'expires_in_months', type: 'int', nullable: true })
  expiresInMonths!: number | null;

  @Column({ ...storageFileReferenceColumn({ name: 'size_chart', nullable: true }) })
  sizeChart!: IStorageFileReference | null;

  @Column({ name: 'single_product_url', type: 'varchar', length: 1000, nullable: true })
  singleProductUrl!: string | null;

  @Column({ name: 'health_concern_ref_ids', type: 'jsonb', nullable: false, default: () => "'[]'" })
  healthConcernRefIds!: string[];

  @Column({ name: 'wellness_goal_ref_ids', type: 'jsonb', nullable: false, default: () => "'[]'" })
  wellnessGoalRefIds!: string[];

  @Column({ name: 'tag_names', type: 'jsonb', nullable: false, default: () => "'[]'" })
  tagNames!: string[];

  @Column({ name: 'category_filters', type: 'jsonb', nullable: false, default: () => "'[]'" })
  categoryFilters!: IVariantCategoryFilterBinding[];

  @Column({ name: 'pack_metadata', type: 'jsonb', nullable: false, default: () => "'[]'" })
  packMetadata!: IProductPackMetadataItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })

  createdAt!: Date;



  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })

  updatedAt!: Date;



  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })

  deletedAt?: Date;



  @ManyToOne(() => ProductEntity, (product) => product.variants, { onDelete: 'CASCADE' })

  @JoinColumn({ name: 'product_id' })

  product!: ProductEntity;

  @ManyToOne(() => ManufacturerEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'manufacturer_id' })
  manufacturer?: ManufacturerEntity | null;

  @ManyToOne(() => PackerEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'packer_id' })
  packer?: PackerEntity | null;

  @ManyToOne(() => ImporterEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'importer_id' })
  importer?: ImporterEntity | null;

  @ManyToOne(() => CountryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'country_of_origin_id' })
  countryOfOrigin?: CountryEntity | null;

  @OneToMany(() => VariantAttributeValueEntity, (value) => value.variant)

  attributeValues!: VariantAttributeValueEntity[];



  @OneToMany(() => ProductMediaEntity, (media) => media.variant)

  media!: ProductMediaEntity[];

}


