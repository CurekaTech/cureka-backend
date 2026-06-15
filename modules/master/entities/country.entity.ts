import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { StateEntity } from './state.entity';

@Entity('countries')
export class CountryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index()
  @Column({ type: 'varchar', length: 3 })
  code!: string;

  @Column({ name: 'phone_code', type: 'varchar', length: 10, nullable: true })
  phoneCode!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @OneToMany(() => StateEntity, (state) => state.country)
  states?: StateEntity[];
}
