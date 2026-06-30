import { UserEntity } from '../entities/user.entity';
import { ICustomerUserListItem, IUser } from '../interfaces/user.interface';
import { mapRoleEntityToResponse } from '@modules/roles/mappers/role.mapper';

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
  roleId: entity.roleId,
  roleRecord: entity.roleRecord ? mapRoleEntityToResponse(entity.roleRecord) : undefined,
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

export const mapCustomerUserEntityToListItem = (entity: UserEntity): ICustomerUserListItem => ({
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
  roleId: entity.roleId,
});

export const mapCustomerUserEntitiesToListItems = (
  entities: UserEntity[],
): ICustomerUserListItem[] => entities.map(mapCustomerUserEntityToListItem);
