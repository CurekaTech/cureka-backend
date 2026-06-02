import { AdminUserRole } from '../enums/admin-user-role.enum';

export interface IAdminUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role: AdminUserRole;
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
