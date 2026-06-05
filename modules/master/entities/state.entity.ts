import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { CountryEntity } from './country.entity';
import { CityEntity } from './city.entity';

@Entity('states')
@Index('UQ_states_country_id_name', ['countryId', 'name'], { unique: true })
export class StateEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  code!: string | null;

  @Index()
  @Column({ name: 'country_id', type: 'uuid' })
  countryId!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @ManyToOne(() => CountryEntity, (country) => country.states, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'country_id' })
  country?: CountryEntity;

  @OneToMany(() => CityEntity, (city) => city.state)
  cities?: CityEntity[];
}
