import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { CityEntity } from './city.entity';
import { StateEntity } from './state.entity';
import { CountryEntity } from './country.entity';

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

  @Column({ name: 'address_line1', type: 'varchar', length: 500, nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line2', type: 'varchar', length: 500, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  landmark!: string | null;

  @Index()
  @Column({ name: 'city_id', type: 'uuid', nullable: true })
  cityId!: string | null;

  @Index()
  @Column({ name: 'state_id', type: 'uuid', nullable: true })
  stateId!: string | null;

  @Index()
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId!: string | null;

  @Column({ name: 'pin_code', type: 'varchar', length: 20, nullable: true })
  pinCode!: string | null;

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

  @ManyToOne(() => CityEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'city_id' })
  city?: CityEntity | null;

  @ManyToOne(() => StateEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'state_id' })
  state?: StateEntity | null;

  @ManyToOne(() => CountryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'country_id' })
  country?: CountryEntity | null;
}
