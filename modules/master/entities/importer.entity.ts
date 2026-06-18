import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('importers')
export class ImporterEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  iec!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo!: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 255, nullable: true })
  contactPerson!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'mobile_number', type: 'varchar', length: 20, nullable: true })
  mobileNumber!: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'gst_number', type: 'varchar', length: 50, nullable: true })
  gstNumber!: string | null;

  @Column({ name: 'drug_license_number', type: 'varchar', length: 100, nullable: true })
  drugLicenseNumber!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'importers_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
