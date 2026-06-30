import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { RoleEntity } from '@modules/roles/entities/role.entity';
import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserGender } from '../enums/user-gender.enum';
import { UserMaritalStatus } from '../enums/user-marital-status.enum';

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

  @Index('IDX_users_role')
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CUSTOMER,
  })
  role!: UserRole;

  @Index('IDX_users_role_id')
  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId?: string;

  @ManyToOne(() => RoleEntity, { nullable: true })
  @JoinColumn({ name: 'role_id' })
  roleRecord?: RoleEntity;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @Column(storageFileReferenceColumn({ name: 'profile_image_url' }))
  profileImageUrl?: IStorageFileReference | null;

  @Column({
    type: 'enum',
    enum: UserGender,
    nullable: true,
  })
  gender?: UserGender;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({
    name: 'marital_status',
    type: 'enum',
    enum: UserMaritalStatus,
    nullable: true,
  })
  maritalStatus?: UserMaritalStatus;
}
