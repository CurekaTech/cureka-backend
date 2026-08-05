import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { UserEntity } from '@modules/users/entities/user.entity';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorStatus } from '../enums/vendor-status.enum';

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

  @Column({ name: 'warehouse_address', type: 'text' })
  warehouseAddress!: string;

  @Column({ name: 'warehouse_pincode', type: 'varchar', length: 20 })
  warehousePincode!: string;

  @Column({ name: 'warehouse_contact_person', type: 'varchar', length: 255, nullable: true })
  warehouseContactPerson!: string | null;

  @Column({ name: 'warehouse_contact_phone', type: 'varchar', length: 20, nullable: true })
  warehouseContactPhone!: string | null;

  @Column({ name: 'pan_number', type: 'varchar', length: 10 })
  panNumber!: string;

  @Column(storageFileReferenceColumn({ name: 'pan_document', nullable: false }))
  panDocument!: IStorageFileReference;

  @Column({ name: 'gst_number', type: 'varchar', length: 20 })
  gstNumber!: string;

  @Column(storageFileReferenceColumn({ name: 'gst_certificate_document', nullable: false }))
  gstCertificateDocument!: IStorageFileReference;

  @Column({ name: 'product_categories', type: 'text', nullable: true })
  productCategories!: string | null;

  @Column({ name: 'brand_details', type: 'text', nullable: true })
  brandDetails!: string | null;

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

  @Column({ name: 'warehouse_code', type: 'varchar', length: 100, nullable: true })
  warehouseCode!: string | null;
}
