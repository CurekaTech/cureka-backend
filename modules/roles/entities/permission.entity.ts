import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { PermissionAction } from '../enums/permission-action.enum';
import { RoleEntity } from './role.entity';

@Entity('permissions')
export class PermissionEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 120 })
  code!: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  module!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: PermissionAction,
    enumName: 'permissions_action_enum',
  })
  action!: PermissionAction;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @ManyToMany(() => RoleEntity, (role) => role.permissions)
  roles?: RoleEntity[];
}
