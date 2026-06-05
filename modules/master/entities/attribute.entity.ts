import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { AttributeDataType } from '../enums/attribute-data-type.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { CategoryEntity } from './category.entity';

@Entity('attributes')
export class AttributeEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    name: 'data_type',
    type: 'enum',
    nullable: true,
    enum: AttributeDataType,
  })
  dataType!: AttributeDataType | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Column({
    name: 'values',
    type: 'text',
    array: true,
    nullable: true,
  })
  values?: string[] | null;

  @ManyToMany(() => CategoryEntity, (category) => category.attributes)
  categories!: CategoryEntity[];
}