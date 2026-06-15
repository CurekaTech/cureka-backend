import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductVariantEntity } from './product-variant.entity';
import { ProductMediaEntity } from './product-media.entity';
import { ProductHealthConcernEntity } from './product-health-concern.entity';
import { ProductTagMappingEntity } from './product-tag-mapping.entity';
import { ProductBundleEntity } from './product-bundle.entity';
import { ProductFaqMappingEntity } from './product-faq-mapping.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { ManufacturerEntity } from '@modules/master/entities/manufacturer.entity';
import { PackerEntity } from '@modules/master/entities/packer.entity';
import { ImporterEntity } from '@modules/master/entities/importer.entity';
import { ProductNatureEntity } from '@modules/master/entities/product-nature.entity';

@Entity('products')
export class ProductEntity extends BaseEntity {
  @Index()
  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId!: string | null;

  @Column({ type: 'varchar', length: 500 })
  name!: string;

  @Index()
  @Column({ type: 'varchar', length: 500 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index()
  @Column({
    name: 'product_type',
    type: 'enum',
    enum: ProductType,
    enumName: 'products_product_type_enum',
  })
  productType!: ProductType;

  @Index()
  @Column({ name: 'product_nature_id', type: 'uuid' })
  productNatureId!: string;

  @Index()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @Index()
  @Column({ name: 'sub_category_id', type: 'uuid', nullable: true })
  subCategoryId!: string | null;

  @Index()
  @Column({ name: 'sub_sub_category_id', type: 'uuid', nullable: true })
  subSubCategoryId!: string | null;

  @Index()
  @Column({ name: 'sub_sub_sub_category_id', type: 'uuid', nullable: true })
  subSubSubCategoryId!: string | null;

  @Index()
  @Column({ name: 'brand_id', type: 'uuid', nullable: true })
  brandId!: string | null;

  @Index()
  @Column({ name: 'manufacturer_id', type: 'uuid', nullable: true })
  manufacturerId!: string | null;

  @Index()
  @Column({ name: 'packer_id', type: 'uuid', nullable: true })
  packerId!: string | null;

  @Index()
  @Column({ name: 'importer_id', type: 'uuid', nullable: true })
  importerId!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'products_status_enum',
    default: ProductStatus.DRAFT,
  })
  status!: ProductStatus;

  @Column({ name: 'subscription_enabled', type: 'boolean', default: false })
  subscriptionEnabled!: boolean;

  @Column({ name: 'cod_available', type: 'boolean', default: false })
  codAvailable!: boolean;

  @Column({ name: 'emi_available', type: 'boolean', default: false })
  emiAvailable!: boolean;

  @Column({ name: 'replace_allowed', type: 'boolean', default: false })
  replaceAllowed!: boolean;

  @Column({ name: 'replace_window_days', type: 'int', nullable: true })
  replaceWindowDays!: number | null;

  @Column({ name: 'return_window_days', type: 'int', nullable: true })
  returnWindowDays!: number | null;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'meta_keywords', type: 'jsonb', nullable: true })
  metaKeywords!: string[] | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'creation_step', type: 'int', default: 1 })
  creationStep!: number;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @ManyToOne(() => ProductNatureEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_nature_id' })
  productNature?: ProductNatureEntity;

  @ManyToOne(() => CategoryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sub_category_id' })
  subCategory?: CategoryEntity | null;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sub_sub_category_id' })
  subSubCategory?: CategoryEntity | null;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sub_sub_sub_category_id' })
  subSubSubCategory?: CategoryEntity | null;

  @ManyToOne(() => BrandEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'brand_id' })
  brand?: BrandEntity | null;

  @ManyToOne(() => ManufacturerEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'manufacturer_id' })
  manufacturer?: ManufacturerEntity | null;

  @ManyToOne(() => PackerEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'packer_id' })
  packer?: PackerEntity | null;

  @ManyToOne(() => ImporterEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'importer_id' })
  importer?: ImporterEntity | null;

  @OneToMany(() => ProductVariantEntity, (variant) => variant.product)
  variants!: ProductVariantEntity[];

  @OneToMany(() => ProductMediaEntity, (media) => media.product)
  media!: ProductMediaEntity[];

  @OneToMany(() => ProductHealthConcernEntity, (mapping) => mapping.product)
  healthConcernMappings!: ProductHealthConcernEntity[];

  @OneToMany(() => ProductTagMappingEntity, (mapping) => mapping.product)
  tagMappings!: ProductTagMappingEntity[];

  @OneToMany(() => ProductBundleEntity, (bundle) => bundle.parentProduct)
  bundleItems!: ProductBundleEntity[];

  @OneToMany(() => ProductFaqMappingEntity, (mapping) => mapping.product)
  faqMappings!: ProductFaqMappingEntity[];
}
