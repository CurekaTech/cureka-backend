import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';

@Entity('cms_pages')
export class CmsPageEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 280 })
  slug!: string;

  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 500, nullable: true })
  metaDescription!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'cms_pages_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  /** Seeded policy pages cannot be deleted or have their slug changed. */
  @Column({ name: 'is_predefined', type: 'boolean', default: false })
  isPredefined!: boolean;
}
