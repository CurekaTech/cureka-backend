import { AdminUserRole } from '../enums/admin-user-role.enum';
import { IRole } from '@modules/roles/interfaces/role.interface';

export interface IAdminUser {
  id: string;
  refId: string;
  fullName: string;
  email: string;
  phone?: string;
  role: AdminUserRole;
  roleId?: string;
  roleRecord?: IRole;
  isActive: boolean;
  lastLoginAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IAdminUserWithPassword extends IAdminUser {
  password: string;
}
