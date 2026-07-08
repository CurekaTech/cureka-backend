import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { BlogPostEntity } from './blog-post.entity';

@Entity('blog_post_products')
export class BlogPostProductEntity extends BaseEntity {
  @Index()
  @Column({ name: 'blog_post_id', type: 'uuid' })
  blogPostId!: string;

  @ManyToOne(() => BlogPostEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blog_post_id' })
  blogPost!: BlogPostEntity;

  @Index()
  @Column({ name: 'product_ref_id', type: 'varchar', length: 11 })
  productRefId!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
