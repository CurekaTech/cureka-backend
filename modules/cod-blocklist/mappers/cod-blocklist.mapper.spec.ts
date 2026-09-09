import { CodBlocklistType } from '../enums/cod-blocklist-type.enum';
import { mapCodBlocklistToListItem, mapCustomerSearchItem } from './cod-blocklist.mapper';

describe('cod-blocklist mapper', () => {
  it('maps a pincode entry', () => {
    const now = new Date('2026-09-08T10:00:00.000Z');
    const item = mapCodBlocklistToListItem({
      id: 'entry-1',
      refId: 'COD2026000001',
      type: CodBlocklistType.PINCODE,
      pincode: '380015',
      customerId: null,
      customerNameSnapshot: null,
      mobileNumber: null,
      reason: 'High RTO',
      isActive: true,
      createdBy: 'admin@cureka.com',
      updatedBy: 'admin@cureka.com',
      createdAt: now,
      updatedAt: now,
    } as never);

    expect(item).toMatchObject({
      id: 'entry-1',
      type: CodBlocklistType.PINCODE,
      pincode: '380015',
      customerId: null,
      customerName: null,
      reason: 'High RTO',
      isActive: true,
    });
  });

  it('prefers live customer name over snapshot', () => {
    const item = mapCodBlocklistToListItem({
      id: 'entry-2',
      refId: 'COD2026000002',
      type: CodBlocklistType.CUSTOMER,
      pincode: null,
      customerId: 'user-1',
      customerNameSnapshot: 'Old Name',
      mobileNumber: '9876543210',
      reason: null,
      isActive: true,
      customer: { firstName: 'Asha', lastName: 'Patel' },
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(item.customerName).toBe('Asha Patel');
    expect(item.mobileNumber).toBe('9876543210');
  });

  it('marks a search result as already blocked', () => {
    const result = mapCustomerSearchItem(
      {
        id: 'user-1',
        firstName: 'Asha',
        lastName: 'Patel',
        mobileNumber: '9876543210',
        email: 'asha@example.com',
      } as never,
      { id: 'entry-9' },
    );

    expect(result).toEqual({
      id: 'user-1',
      firstName: 'Asha',
      lastName: 'Patel',
      fullName: 'Asha Patel',
      mobileNumber: '9876543210',
      email: 'asha@example.com',
      alreadyBlocked: true,
      activeBlocklistEntryId: 'entry-9',
    });
  });
});
