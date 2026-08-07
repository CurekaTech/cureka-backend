import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { VendorEntity } from './vendor.entity';

@Entity('vendor_warehouses')
export class VendorWarehouseEntity extends BaseEntity {
  @Index('IDX_vendor_warehouses_vendor_id')
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  @Column({ type: 'text' })
  address!: string;

  @Column({ type: 'varchar', length: 20 })
  pincode!: string;

  @Column({ name: 'contact_person', type: 'varchar', length: 255, nullable: true })
  contactPerson!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
  contactPhone!: string | null;

  @Column({ name: 'warehouse_code', type: 'varchar', length: 100, nullable: true })
  warehouseCode!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @ManyToOne(() => VendorEntity, (vendor) => vendor.warehouses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: VendorEntity;
}
