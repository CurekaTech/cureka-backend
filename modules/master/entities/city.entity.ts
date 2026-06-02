import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { StateEntity } from './state.entity';

@Entity('cities')
@Index('UQ_cities_state_id_name', ['stateId', 'name'], { unique: true })
export class CityEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index()
  @Column({ name: 'state_id', type: 'uuid' })
  stateId!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @ManyToOne(() => StateEntity, (state) => state.cities, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'state_id' })
  state?: StateEntity;
}
