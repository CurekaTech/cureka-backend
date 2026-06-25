import { UserAddressType } from '../enums/user-address-type.enum';

export interface IUserAddress {
  id: string;
  refId: string;
  userId: string;
  recipientName: string;
  phoneNumber: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  addressType: UserAddressType;
  isDefault: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/** Immutable snapshot copied into orders at checkout. */
export interface IUserAddressSnapshot {
  recipientName: string;
  phoneNumber: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  addressType: UserAddressType;
}
