import { roundMoney } from '../utils/money.util';
import {
  AbandonedCartListRow,
  IAbandonedCartCustomerSummary,
  IAbandonedCartListItem,
} from '../interfaces/abandoned-cart.interface';

export const formatAbandonedCartCustomerName = (input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobileNumber?: string | null;
  refId?: string | null;
}): string => {
  const name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  return input.email || input.mobileNumber || input.refId || '';
};

export const mapAbandonedCartListRow = (row: AbandonedCartListRow): IAbandonedCartListItem => {
  const customer: IAbandonedCartCustomerSummary = {
    id: row.userId,
    refId: row.userRefId,
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    name: formatAbandonedCartCustomerName({
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      mobileNumber: row.mobileNumber,
      refId: row.userRefId,
    }),
    mobileNumber: row.mobileNumber ?? undefined,
    email: row.email ?? undefined,
    isGuest: row.isGuest,
  };

  return {
    id: row.id,
    refId: row.refId,
    customer,
    itemCount: row.itemCount,
    totalAmount: roundMoney(row.totalAmount),
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};
