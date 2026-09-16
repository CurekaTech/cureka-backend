import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { BlogPostStatus } from '../enums/blog-post-status.enum';
import { BlogPostVisibility } from '../enums/blog-post-visibility.enum';
import { BlogVideoType } from '../enums/blog-video-type.enum';

export type BlogPostVideo =
  | {
      type: BlogVideoType.FILE;
      file: IStorageFileReference;
      title?: string | null;
      subtitle?: string | null;
    }
  | {
      type: BlogVideoType.URL;
      url: string;
      title?: string | null;
      subtitle?: string | null;
    };

@Entity('blog_posts')
export class BlogPostEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 280 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  excerpt!: string | null;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'" })
  faqs!: Array<{ question: string; answer: string; sequence?: number }>;

  @Index()
  @Column({ name: 'category_ref_id', type: 'varchar', length: 16 })
  categoryRefId!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  author!: string | null;

  @Column(storageFileReferenceColumn({ name: 'featured_image', nullable: true }))
  featuredImage!: IStorageFileReference | null;

  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'" })
  videos!: BlogPostVideo[];

  @Column({ type: 'simple-array', nullable: true })
  tags!: string[] | null;

  @Index()
  @Column({
    type: 'enum',
    enum: BlogPostStatus,
    enumName: 'blog_post_status_enum',
    default: BlogPostStatus.DRAFT,
  })
  status!: BlogPostStatus;

  @Index()
  @Column({
    type: 'enum',
    enum: BlogPostVisibility,
    enumName: 'blog_post_visibility_enum',
    default: BlogPostVisibility.PUBLIC,
  })
  visibility!: BlogPostVisibility;

  @Index()
  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured!: boolean;

  @Index()
  @Column({ name: 'is_trending', type: 'boolean', default: false })
  isTrending!: boolean;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 500, nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'meta_keywords', type: 'varchar', length: 500, nullable: true })
  metaKeywords!: string | null;

  @Index()
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  views!: number;
}
