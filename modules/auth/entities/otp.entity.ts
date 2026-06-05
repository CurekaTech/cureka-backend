import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OtpPurpose } from '../enums/otp-purpose.enum';

/**
 * Stores hashed OTP codes for mobile number verification.
 * Does NOT extend BaseEntity — OTP logs are not user-facing resources
 * and do not require refId, softDelete, or audit columns.
 */
@Entity('otp_logs')
export class OtpEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_otp_logs_mobile_number')
  @Column({ name: 'mobile_number', type: 'varchar', length: 20 })
  mobileNumber!: string;

  /** Stored as bcrypt hash — NEVER store plain-text OTP. */
  @Column({ name: 'otp_code', type: 'varchar', length: 255 })
  otpCode!: string;

  @Column({ type: 'enum', enum: OtpPurpose, default: OtpPurpose.LOGIN })
  purpose!: OtpPurpose;

  @Index('IDX_otp_logs_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Index('IDX_otp_logs_is_verified')
  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
