import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { UserStatus } from '../enums/user-status.enum';

@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Index('IDX_users_email_unique', { unique: true, where: '"email" IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Index('IDX_users_mobile_number_unique', { unique: true, where: '"mobile_number" IS NOT NULL' })
  @Column({ name: 'mobile_number', type: 'varchar', length: 20, nullable: true })
  mobileNumber?: string;

  @Column({ name: 'is_guest', type: 'boolean', default: false })
  isGuest!: boolean;

  @Column({ name: 'is_registered', type: 'boolean', default: false })
  isRegistered!: boolean;

  @Index('IDX_users_status')
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;
}
