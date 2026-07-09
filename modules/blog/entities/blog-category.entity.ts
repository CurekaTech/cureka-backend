import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { BlogCategoryStatus } from '../enums/blog-category-status.enum';

@Entity('blog_categories')
export class BlogCategoryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180 })
  slug!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column(storageFileReferenceColumn())
  icon!: IStorageFileReference | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: BlogCategoryStatus,
    enumName: 'blog_category_status_enum',
    default: BlogCategoryStatus.ACTIVE,
  })
  status!: BlogCategoryStatus;
}
