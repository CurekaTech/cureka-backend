import { UserAddressEntity } from '../entities/user-address.entity';
import { IUserAddress, IUserAddressSnapshot } from '../interfaces/user-address.interface';

export const mapUserAddressEntityToResponse = (entity: UserAddressEntity): IUserAddress => ({
  id: entity.id,
  refId: entity.refId,
  userId: entity.userId,
  recipientName: entity.recipientName,
  phoneNumber: entity.phoneNumber,
  pincode: entity.pincode,
  addressLine1: entity.addressLine1,
  addressLine2: entity.addressLine2,
  landmark: entity.landmark,
  city: entity.city,
  state: entity.state,
  addressType: entity.addressType,
  isDefault: entity.isDefault,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapUserAddressToSnapshot = (address: IUserAddress): IUserAddressSnapshot => ({
  recipientName: address.recipientName,
  phoneNumber: address.phoneNumber,
  pincode: address.pincode,
  addressLine1: address.addressLine1,
  addressLine2: address.addressLine2,
  landmark: address.landmark,
  city: address.city,
  state: address.state,
  addressType: address.addressType,
});
