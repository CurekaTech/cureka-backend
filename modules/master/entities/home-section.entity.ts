import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { HomeSectionType } from '../enums/home-section-type.enum';

@Entity('home_sections')
@Index('IDX_home_sections_status_index', ['status', 'sectionIndex'])
export class HomeSectionEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: HomeSectionType,
    enumName: 'home_sections_type_enum',
  })
  type!: HomeSectionType;

  @Column({ name: 'section_index', type: 'int' })
  sectionIndex!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'home_sections_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}
