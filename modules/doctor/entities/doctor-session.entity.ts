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
import { DoctorEntity } from './doctor.entity';

/**
 * Long-lived refresh sessions for doctor auth.
 * Does NOT extend BaseEntity — mirrors user_sessions.
 */
@Entity('doctor_sessions')
export class DoctorSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_doctor_sessions_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('UQ_doctor_sessions_refresh_token_hash', { unique: true })
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64 })
  refreshTokenHash!: string;

  @Column({ name: 'device_id', type: 'varchar', length: 64, nullable: true })
  deviceId!: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 120, nullable: true })
  deviceName!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Index('IDX_doctor_sessions_last_activity')
  @Column({ name: 'last_activity', type: 'timestamptz' })
  lastActivity!: Date;

  @Index('IDX_doctor_sessions_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Index('IDX_doctor_sessions_is_revoked')
  @Column({ name: 'is_revoked', type: 'boolean', default: false })
  isRevoked!: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
