import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { AdminUserRole } from '../enums/admin-user-role.enum';

@Entity('admin_users')
export class AdminUserEntity extends BaseEntity {
  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password!: string;

  @Column({
    type: 'enum',
    enum: AdminUserRole,
    default: AdminUserRole.ADMIN,
  })
  role!: AdminUserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;
}
