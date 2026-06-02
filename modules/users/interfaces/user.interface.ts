import { UserGender } from '../enums/user-gender.enum';

export interface IUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  gender?: UserGender;
  dob?: Date;
  isActive: boolean;
  lastLoginAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IUserWithPassword extends IUser {
  password: string;
}
