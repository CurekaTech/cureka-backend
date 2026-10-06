import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';
import { PromotionalPageSectionEntity } from './promotional-page-section.entity';

@Entity('promotional_page_section_items')
@Index('IDX_promotional_page_section_items_section_sort', ['sectionId', 'sortOrder'])
export class PromotionalPageSectionItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId!: string;

  @ManyToOne(() => PromotionalPageSectionEntity, (section) => section.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'section_id' })
  section?: PromotionalPageSectionEntity;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: PromotionalTargetType,
    enumName: 'promotional_target_type_enum',
  })
  targetType!: PromotionalTargetType;

  @Column({ name: 'target_ref_id', type: 'varchar', length: 16 })
  targetRefId!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
