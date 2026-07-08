import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BlogAuditAction } from '../enums/blog-audit-action.enum';

@Entity('blog_audit_logs')
export class BlogAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'blog_post_id', type: 'uuid' })
  blogPostId!: string;

  @Column({
    type: 'enum',
    enum: BlogAuditAction,
    enumName: 'blog_audit_action_enum',
  })
  action!: BlogAuditAction;

  @Column({ name: 'performed_by', type: 'varchar', length: 255 })
  performedBy!: string;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
