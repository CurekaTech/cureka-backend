import { UserStatus } from '../enums/user-status.enum';

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
  lastLoginAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
