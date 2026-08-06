import { UserEntity } from '../entities/user.entity';
import {
  IAdminUserListItem,
  ICustomerUserListItem,
  IUser,
  IUserOrderMetrics,
} from '../interfaces/user.interface';
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
  country: null,
  createdBy: entity.createdBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
  }) as IUser;

export const EMPTY_USER_ORDER_METRICS: IUserOrderMetrics = {
  totalOrders: 0,
  totalSpend: 0,
  lastOrderAt: null,
};

export const mapUserEntityToAdminListItem = (
  entity: UserEntity,
  metrics: IUserOrderMetrics = EMPTY_USER_ORDER_METRICS,
): IAdminUserListItem => ({
  ...mapUserEntityToResponse(entity),
  totalOrders: metrics.totalOrders,
  totalSpend: metrics.totalSpend,
  lastOrderAt: metrics.lastOrderAt,
});

export const mapUserEntitiesToResponse = (entities: UserEntity[]): IUser[] =>
  entities.map(mapUserEntityToResponse);

export const mapCustomerUserEntityToListItem = (entity: UserEntity): ICustomerUserListItem => {
  const nameParts = [entity.firstName, entity.lastName].filter(Boolean);
  return {
    id: entity.id,
    refId: entity.refId,
    firstName: entity.firstName,
    lastName: entity.lastName,
    name: nameParts.length ? nameParts.join(' ') : entity.email ?? entity.mobileNumber ?? entity.refId,
    email: entity.email,
    phone: entity.mobileNumber,
    mobileNumber: entity.mobileNumber,
    isGuest: entity.isGuest,
    isRegistered: entity.isRegistered,
    status: entity.status,
    role: entity.role,
    roleId: entity.roleId,
  };
};

export const mapCustomerUserEntitiesToListItems = (
  entities: UserEntity[],
): ICustomerUserListItem[] => entities.map(mapCustomerUserEntityToListItem);
