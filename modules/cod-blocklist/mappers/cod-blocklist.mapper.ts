import { maskMobile } from '@packages/logger';
import { CodBlocklistEntryEntity } from '../entities/cod-blocklist-entry.entity';
import {
  ICodBlocklistCustomerSearchItem,
  ICodBlocklistListItem,
} from '../interfaces/cod-blocklist.interface';
import { UserEntity } from '@modules/users/entities/user.entity';

function fullName(first?: string | null, last?: string | null, snapshot?: string | null): string | null {
  const name = `${first ?? ''} ${last ?? ''}`.trim();
  return name || snapshot || null;
}

export function mapCodBlocklistToListItem(entity: CodBlocklistEntryEntity): ICodBlocklistListItem {
  return {
    id: entity.id,
    refId: entity.refId,
    type: entity.type,
    pincode: entity.pincode,
    customerId: entity.customerId,
    customerName: fullName(
      entity.customer?.firstName,
      entity.customer?.lastName,
      entity.customerNameSnapshot,
    ),
    mobileNumber: entity.mobileNumber,
    reason: entity.reason,
    isActive: entity.isActive,
    createdBy: entity.createdBy ?? null,
    updatedBy: entity.updatedBy ?? null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function mapCustomerSearchItem(
  user: UserEntity,
  activeBlock?: { id: string } | null,
): ICodBlocklistCustomerSearchItem {
  const firstName = user.firstName?.trim() || null;
  const lastName = user.lastName?.trim() || null;
  return {
    id: user.id,
    firstName,
    lastName,
    fullName: fullName(firstName, lastName, null) || user.mobileNumber || user.refId,
    mobileNumber: user.mobileNumber ?? null,
    email: user.email ?? null,
    alreadyBlocked: Boolean(activeBlock),
    activeBlocklistEntryId: activeBlock?.id ?? null,
  };
}

export function maskBlocklistMobile(mobile?: string | null): string | null {
  return mobile ? maskMobile(mobile) : null;
}
