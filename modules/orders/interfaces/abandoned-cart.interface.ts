import { CartResponse } from './cart-pricing.interface';
import { IUser } from '@modules/users/interfaces/user.interface';
import { IUserAddress } from '@modules/users/interfaces/user-address.interface';

export interface IAbandonedCartCustomerSummary {
  id: string;
  refId: string;
  firstName?: string;
  lastName?: string;
  name: string;
  mobileNumber?: string;
  email?: string;
  isGuest: boolean;
}

export interface IAbandonedCartListItem {
  id: string;
  refId: string;
  customer: IAbandonedCartCustomerSummary;
  itemCount: number;
  totalAmount: number;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAbandonedCartDetail {
  id: string;
  refId: string;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
  customer: IUser;
  addresses: IUserAddress[];
  defaultAddress: IUserAddress | null;
  cart: CartResponse;
}

export interface AbandonedCartListRow {
  id: string;
  refId: string;
  userId: string;
  userRefId: string;
  firstName: string | null;
  lastName: string | null;
  mobileNumber: string | null;
  email: string | null;
  isGuest: boolean;
  itemCount: number;
  totalAmount: number;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AbandonedCartListOptions {
  page: number;
  limit: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface AbandonedCartNotifyCandidate {
  cartId: string;
  cartRefId: string;
  userId: string;
  mobileNumber: string | null;
  lastActivityAt: Date;
  itemCount: number;
}
