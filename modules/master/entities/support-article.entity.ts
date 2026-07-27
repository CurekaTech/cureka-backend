import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { SupportContentStatus } from '../enums/support-content-status.enum';

@Entity('support_articles')
export class SupportArticleEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 280 })
  slug!: string;

  @Index()
  @Column({ name: 'category_ref_id', type: 'varchar', length: 16 })
  categoryRefId!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column(storageFileReferenceColumn({ name: 'featured_image', nullable: true }))
  featuredImage!: IStorageFileReference | null;

  @Index()
  @Column({
    type: 'enum',
    enum: SupportContentStatus,
    enumName: 'support_content_status_enum',
    default: SupportContentStatus.ACTIVE,
  })
  status!: SupportContentStatus;

  @Column({ type: 'int', default: 0 })
  views!: number;
}
