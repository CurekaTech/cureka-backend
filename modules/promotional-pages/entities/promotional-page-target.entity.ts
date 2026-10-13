import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';
import { PromotionalPageEntity } from './promotional-page.entity';

/** Page-level campaign references. These do not calculate discounts. */
@Entity('promotional_page_targets')
@Index('IDX_promotional_page_targets_page_sort', ['promotionalPageId', 'sortOrder'])
export class PromotionalPageTargetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'promotional_page_id', type: 'uuid' })
  promotionalPageId!: string;

  @ManyToOne(() => PromotionalPageEntity, (page) => page.targets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotional_page_id' })
  page?: PromotionalPageEntity;

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
