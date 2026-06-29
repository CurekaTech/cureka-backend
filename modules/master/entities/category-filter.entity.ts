import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { CategoryEntity } from './category.entity';

@Entity('category_filters')
export class CategoryFilterEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

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

  @ManyToMany(() => CategoryEntity, (category) => category.categoryFilters)
  categories!: CategoryEntity[];
}
