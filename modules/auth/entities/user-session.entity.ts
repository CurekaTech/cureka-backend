import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '@modules/users/entities/user.entity';

/**
 * Long-lived refresh sessions for customer/vendor user auth.
 * Does NOT extend BaseEntity — sessions are internal auth records.
 * FK to users.id is enforced at the DB level (see migration).
 */
@Entity('user_sessions')
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_user_sessions_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Index('IDX_user_sessions_refresh_token_hash', { unique: true })
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64 })
  refreshTokenHash!: string;

  @Index('IDX_user_sessions_device_id')
  @Column({ name: 'device_id', type: 'varchar', length: 64 })
  deviceId!: string;

  @Column({ name: 'device_name', type: 'varchar', length: 120, nullable: true })
  deviceName?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  browser?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  os?: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Index('IDX_user_sessions_last_activity')
  @Column({ name: 'last_activity', type: 'timestamptz' })
  lastActivity!: Date;

  @Index('IDX_user_sessions_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Index('IDX_user_sessions_is_revoked')
  @Column({ name: 'is_revoked', type: 'boolean', default: false })
  isRevoked!: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
