import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { BlogCommentStatus } from '../enums/blog-comment-status.enum';
import { BlogPostEntity } from './blog-post.entity';

@Entity('blog_comments')
export class BlogCommentEntity extends BaseEntity {
  @Index()
  @Column({ name: 'blog_post_id', type: 'uuid' })
  blogPostId!: string;

  @ManyToOne(() => BlogPostEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blog_post_id' })
  blogPost!: BlogPostEntity;

  @Index()
  @Column({ name: 'blog_post_ref_id', type: 'varchar', length: 16 })
  blogPostRefId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'guest_name', type: 'varchar', length: 150, nullable: true })
  guestName!: string | null;

  @Column({ name: 'guest_email', type: 'varchar', length: 255, nullable: true })
  guestEmail!: string | null;

  @Column({ type: 'text' })
  content!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: BlogCommentStatus,
    enumName: 'blog_comment_status_enum',
    default: BlogCommentStatus.PENDING,
  })
  status!: BlogCommentStatus;

  @Column({ name: 'moderated_by', type: 'varchar', length: 255, nullable: true })
  moderatedBy!: string | null;

  @Column({ name: 'moderated_at', type: 'timestamptz', nullable: true })
  moderatedAt!: Date | null;
}
