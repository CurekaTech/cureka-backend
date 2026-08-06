import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserGender } from '../enums/user-gender.enum';
import { UserMaritalStatus } from '../enums/user-marital-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';
import { IRole } from '@modules/roles/interfaces/role.interface';
import { IUserAddress } from './user-address.interface';

export interface IUser {
  id: string;
  refId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobileNumber?: string;
  isGuest: boolean;
  isRegistered: boolean;
  status: UserStatus;
  role: UserRole;
  roleId?: string;
  roleRecord?: IRole;
  lastLoginAt?: Date;
  profileImageUrl?: IStorageFileReferenceResponse | null;
  gender?: UserGender;
  dateOfBirth?: Date;
  maritalStatus?: UserMaritalStatus;
  /** Not stored on users yet — reserved for admin UI; currently null. */
  country?: string | null;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IUserOrderMetrics {
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: Date | null;
}

export interface IUserRecentOrder {
  id: string;
  refId: string;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  total: number;
}

/** Admin users list row — profile + order aggregates. */
export interface IAdminUserListItem extends IUser {
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: Date | null;
}

/** Admin user detail — profile, metrics, addresses, recent orders. */
export interface IAdminUserDetail extends IAdminUserListItem {
  addresses: Array<IUserAddress & { country: string }>;
  recentOrders: IUserRecentOrder[];
}

export interface ICustomerUserListItem {
  id: string;
  refId: string;
  firstName?: string;
  lastName?: string;
  /** Full name suitable for list display */
  name: string;
  email?: string;
  phone?: string;
  mobileNumber?: string;
  isGuest: boolean;
  isRegistered: boolean;
  status: UserStatus;
  role: UserRole;
  roleId?: string;
}

/** Admin customer detail — profile plus linked addresses. */
export interface ICustomerDetail extends IUser {
  addresses: IUserAddress[];
}
