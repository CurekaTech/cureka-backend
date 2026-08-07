import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorStatus } from '../enums/vendor-status.enum';
import { VendorCategoryHierarchyEntity } from './vendor-category-hierarchy.entity';
import { VendorWarehouseEntity } from './vendor-warehouse.entity';

@Entity('vendors')
export class VendorEntity extends BaseEntity {
  @Index('IDX_vendors_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'company_name', type: 'varchar', length: 255 })
  companyName!: string;

  @Column({ name: 'contact_person', type: 'varchar', length: 255 })
  contactPerson!: string;

  @Index('IDX_vendors_email')
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Index('IDX_vendors_mobile_number')
  @Column({ name: 'mobile_number', type: 'varchar', length: 20 })
  mobileNumber!: string;

  @Column({ name: 'business_address', type: 'text' })
  businessAddress!: string;

  @Column({ name: 'pan_number', type: 'varchar', length: 10 })
  panNumber!: string;

  @Column(storageFileReferenceColumn({ name: 'pan_document', nullable: false }))
  panDocument!: IStorageFileReference;

  @Column({ name: 'gst_number', type: 'varchar', length: 20 })
  gstNumber!: string;

  @Column(storageFileReferenceColumn({ name: 'gst_certificate_document', nullable: false }))
  gstCertificateDocument!: IStorageFileReference;

  /** Product catalog sheet uploaded at onboarding — stored as-is, not parsed/validated. */
  @Column(storageFileReferenceColumn({ name: 'product_excel_sheet', nullable: false }))
  productExcelSheet!: IStorageFileReference;

  @Column({ name: 'company_profile', type: 'text', nullable: true })
  companyProfile!: string | null;

  @Index('IDX_vendors_status')
  @Column({
    type: 'enum',
    enum: VendorStatus,
    enumName: 'vendors_status_enum',
    default: VendorStatus.PENDING,
  })
  status!: VendorStatus;

  @Column({
    type: 'enum',
    enum: VendorSource,
    enumName: 'vendors_source_enum',
  })
  source!: VendorSource;

  @OneToMany(() => VendorCategoryHierarchyEntity, (hierarchy) => hierarchy.vendor)
  categoryHierarchies!: VendorCategoryHierarchyEntity[];

  @ManyToMany(() => BrandEntity, { eager: false })
  @JoinTable({
    name: 'vendor_brands',
    joinColumn: { name: 'vendor_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'brand_id', referencedColumnName: 'id' },
  })
  brands!: BrandEntity[];

  @OneToMany(() => VendorWarehouseEntity, (warehouse) => warehouse.vendor)
  warehouses!: VendorWarehouseEntity[];
}
