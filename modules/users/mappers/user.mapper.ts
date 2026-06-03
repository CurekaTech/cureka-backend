import { UserEntity } from '../entities/user.entity';
import { IUser } from '../interfaces/user.interface';

export const mapUserEntityToResponse = (entity: UserEntity): IUser => ({
  id: entity.id,
  refId: entity.refId,
  fullName: entity.fullName,
  email: entity.email,
  phone: entity.phone,
  gender: entity.gender,
  dob: entity.dob,
  isActive: entity.isActive,
  lastLoginAt: entity.lastLoginAt,
  createdBy: entity.createdBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapUserEntitiesToResponse = (entities: UserEntity[]): IUser[] =>
  entities.map(mapUserEntityToResponse);
