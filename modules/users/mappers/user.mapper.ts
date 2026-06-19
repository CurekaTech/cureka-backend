import { UserEntity } from '../entities/user.entity';
import { IUser } from '../interfaces/user.interface';

export const mapUserEntityToResponse = (entity: UserEntity): IUser =>
  ({
  id: entity.id,
  refId: entity.refId,
  firstName: entity.firstName,
  lastName: entity.lastName,
  email: entity.email,
  mobileNumber: entity.mobileNumber,
  isGuest: entity.isGuest,
  isRegistered: entity.isRegistered,
  status: entity.status,
  role: entity.role,
  lastLoginAt: entity.lastLoginAt,
  profileImageUrl: entity.profileImageUrl,
  gender: entity.gender,
  dateOfBirth: entity.dateOfBirth,
  maritalStatus: entity.maritalStatus,
  createdBy: entity.createdBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as IUser;

export const mapUserEntitiesToResponse = (entities: UserEntity[]): IUser[] =>
  entities.map(mapUserEntityToResponse);
