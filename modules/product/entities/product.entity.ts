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
import { PolicyWindowUnit } from '../enums/policy-window-unit.enum';
import { ProductVariantEntity } from './product-variant.entity';
import { ProductMediaEntity } from './product-media.entity';
import { ProductHealthConcernEntity } from './product-health-concern.entity';
import { ProductWellnessGoalEntity } from './product-wellness-goal.entity';
import { ProductTagMappingEntity } from './product-tag-mapping.entity';
import { ProductBundleEntity } from './product-bundle.entity';
import { ProductFaqMappingEntity } from './product-faq-mapping.entity';
import { ProductAttributeMappingEntity } from './product-attribute-mapping.entity';
import { ProductCategoryFilterMappingEntity } from './product-category-filter-mapping.entity';
import { ProductCategoryHierarchyEntity } from './product-category-hierarchy.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { ManufacturerEntity } from '@modules/master/entities/manufacturer.entity';
import { PackerEntity } from '@modules/master/entities/packer.entity';
import { ImporterEntity } from '@modules/master/entities/importer.entity';
import { ProductNatureEntity } from '@modules/master/entities/product-nature.entity';
import { CountryEntity } from '@modules/master/entities/country.entity';
import { IProductInformationItem } from '../interfaces/product-information.interface';
import { IProductPackMetadataItem } from '../interfaces/product-pack-metadata.interface';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';

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

  @Column({ type: 'text', nullable: true })
  components!: string | null;

  @Index()
  @Column({
    name: 'product_type',
    type: 'enum',
    enum: ProductType,
    enumName: 'products_product_type_enum',
  })
  productType!: ProductType;

  @Index()
  @Column({ name: 'product_nature_id', type: 'uuid', nullable: true })
  productNatureId!: string | null;

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

  @Column({ name: 'return_allowed', type: 'boolean', default: false })
  returnAllowed!: boolean;

  @Column({ name: 'return_policy', type: 'text', nullable: true })
  returnPolicy!: string | null;

  @Column({ name: 'refund_allowed', type: 'boolean', default: true })
  refundAllowed!: boolean;

  @Column({
    name: 'return_window_unit',
    type: 'enum',
    enum: PolicyWindowUnit,
    enumName: 'policy_window_unit_enum',
    default: PolicyWindowUnit.DAYS,
  })
  returnWindowUnit!: PolicyWindowUnit;

  @Column({
    name: 'replace_window_unit',
    type: 'enum',
    enum: PolicyWindowUnit,
    enumName: 'policy_window_unit_enum',
    default: PolicyWindowUnit.DAYS,
  })
  replaceWindowUnit!: PolicyWindowUnit;

  @Column({ name: 'return_pickup_required', type: 'boolean', default: true })
  returnPickupRequired!: boolean;

  @Column({ name: 'return_qc_required', type: 'boolean', default: true })
  returnQcRequired!: boolean;

  @Column({ name: 'return_evidence_required', type: 'boolean', default: false })
  returnEvidenceRequired!: boolean;

  @Column({ name: 'no_pickup_refund_allowed', type: 'boolean', default: false })
  noPickupRefundAllowed!: boolean;

  @Column({ name: 'product_information', type: 'jsonb', nullable: false, default: () => "'[]'" })
  productInformation!: IProductInformationItem[];

  @Index()
  @Column({ name: 'country_of_origin_id', type: 'uuid', nullable: true })
  countryOfOriginId!: string | null;

  @Column({ name: 'expires_in_months', type: 'int', nullable: true })
  expiresInMonths!: number | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'meta_title', type: 'varchar', length: 500, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'meta_keywords', type: 'jsonb', nullable: true })
  metaKeywords!: string[] | null;

  @Column({ name: 'curated_by', type: 'varchar', length: 500, nullable: true })
  curatedBy!: string | null;

  @Column({ name: 'curated_for', type: 'text', nullable: true })
  curatedFor!: string | null;

  /** Bundle-only icon shown on public bundle list/detail cards. */
  @Column({ ...storageFileReferenceColumn({ name: 'bundle_icon', nullable: true }) })
  bundleIcon!: IStorageFileReference | null;

  @Column({ ...storageFileReferenceColumn({ name: 'size_chart', nullable: true }) })
  sizeChart!: IStorageFileReference | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Index()
  @Column({ name: 'external_product_id', type: 'varchar', length: 255, nullable: true })
  externalProductId!: string | null;

  @Column({ name: 'single_product_url', type: 'varchar', length: 1000, nullable: true })
  singleProductUrl!: string | null;

  @Column({ name: 'pack_metadata', type: 'jsonb', nullable: false, default: () => "'[]'" })
  packMetadata!: IProductPackMetadataItem[];

  @Column({ name: 'manufacturer_address', type: 'text', nullable: true })
  manufacturerAddress!: string | null;

  @Column({ name: 'packer_address', type: 'text', nullable: true })
  packerAddress!: string | null;

  @Column({ name: 'importer_address', type: 'text', nullable: true })
  importerAddress!: string | null;

  @ManyToOne(() => ProductNatureEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_nature_id' })
  productNature?: ProductNatureEntity | null;

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

  @ManyToOne(() => CountryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'country_of_origin_id' })
  countryOfOrigin?: CountryEntity | null;

  @OneToMany(() => ProductVariantEntity, (variant) => variant.product)
  variants!: ProductVariantEntity[];

  @OneToMany(() => ProductMediaEntity, (media) => media.product)
  media!: ProductMediaEntity[];

  @OneToMany(() => ProductHealthConcernEntity, (mapping) => mapping.product)
  healthConcernMappings!: ProductHealthConcernEntity[];

  @OneToMany(() => ProductWellnessGoalEntity, (mapping) => mapping.product)
  wellnessGoalMappings!: ProductWellnessGoalEntity[];

  @OneToMany(() => ProductTagMappingEntity, (mapping) => mapping.product)
  tagMappings!: ProductTagMappingEntity[];

  @OneToMany(() => ProductBundleEntity, (bundle) => bundle.parentProduct)
  bundleItems!: ProductBundleEntity[];

  @OneToMany(() => ProductFaqMappingEntity, (mapping) => mapping.product)
  faqMappings!: ProductFaqMappingEntity[];

  @OneToMany(() => ProductAttributeMappingEntity, (mapping) => mapping.product)
  attributeMappings!: ProductAttributeMappingEntity[];

  @OneToMany(() => ProductCategoryFilterMappingEntity, (mapping) => mapping.product)
  categoryFilterMappings!: ProductCategoryFilterMappingEntity[];

  @OneToMany(() => ProductCategoryHierarchyEntity, (mapping) => mapping.product)
  categoryHierarchies!: ProductCategoryHierarchyEntity[];
}
