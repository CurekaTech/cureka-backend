import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserGender } from '../enums/user-gender.enum';
import { UserMaritalStatus } from '../enums/user-marital-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

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
  lastLoginAt?: Date;
  profileImageUrl?: IStorageFileReferenceResponse | null;
  gender?: UserGender;
  dateOfBirth?: Date;
  maritalStatus?: UserMaritalStatus;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
