import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import type { PromotionalSectionConfig } from '../utils/promotional-page-content.util';
import { PromotionalPageSectionItemEntity } from './promotional-page-section-item.entity';
import { PromotionalPageEntity } from './promotional-page.entity';

@Entity('promotional_page_sections')
@Index('IDX_promotional_page_sections_page_sort', ['promotionalPageId', 'sortOrder'])
export class PromotionalPageSectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'promotional_page_id', type: 'uuid' })
  promotionalPageId!: string;

  @ManyToOne(() => PromotionalPageEntity, (page) => page.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotional_page_id' })
  page?: PromotionalPageEntity;

  @Column({
    type: 'enum',
    enum: PromotionalSectionType,
    enumName: 'promotional_page_sections_type_enum',
  })
  type!: PromotionalSectionType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle!: string | null;

  /** Presentation-only fields. Catalog rows live in section items. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  config!: PromotionalSectionConfig;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'start_at', type: 'timestamptz', nullable: true })
  startAt!: Date | null;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;

  @OneToMany(() => PromotionalPageSectionItemEntity, (item) => item.section)
  items?: PromotionalPageSectionItemEntity[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
