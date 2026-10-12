import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';

/**
 * Server-side sessions for the super admin account only.
 * Does not extend BaseEntity — these rows are internal auth records.
 */
@Entity('admin_sessions')
export class AdminSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_admin_sessions_admin_user_id')
  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId!: string;

  @ManyToOne(() => AdminUserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_user_id' })
  adminUser!: AdminUserEntity;

  @Index('IDX_admin_sessions_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
