import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@modules/users/enums/user-role.enum';
import {
  COD_BLOCKLIST_INVALID_CUSTOMER,
  COD_BLOCKLIST_INVALID_PINCODE,
  COD_BLOCKLIST_NOT_FOUND,
  COD_BLOCKLIST_TYPE_IMMUTABLE,
} from '../constants/cod-blocklist.constants';
import {
  COD_BLOCKED_FOR_CUSTOMER_MESSAGE,
  COD_BLOCKED_FOR_PINCODE_MESSAGE,
  COD_BLOCKLIST_DUPLICATE_CUSTOMER,
  COD_BLOCKLIST_DUPLICATE_PINCODE,
  CodBlockMatchedBy,
  CodBlockReasonCode,
} from '../enums/cod-block-reason-code.enum';
import { CodBlocklistType } from '../enums/cod-blocklist-type.enum';
import { CodBlocklistService } from './cod-blocklist.service';

const now = new Date('2026-09-08T10:00:00.000Z');

function pincodeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pin-1',
    refId: 'COD2026000001',
    type: CodBlocklistType.PINCODE,
    pincode: '380015',
    customerId: null,
    mobileNumber: null,
    customerNameSnapshot: null,
    reason: 'High RTO rate',
    isActive: true,
    createdBy: 'admin@cureka.com',
    updatedBy: 'admin@cureka.com',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function customerEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    refId: 'COD2026000002',
    type: CodBlocklistType.CUSTOMER,
    pincode: null,
    customerId: 'user-1',
    mobileNumber: '9876543210',
    customerNameSnapshot: 'Asha Patel',
    reason: 'Repeated COD returns',
    isActive: true,
    createdBy: 'admin@cureka.com',
    updatedBy: 'admin@cureka.com',
    createdAt: now,
    updatedAt: now,
    customer: { firstName: 'Asha', lastName: 'Patel' },
    ...overrides,
  };
}

describe('CodBlocklistService', () => {
  const repository = {
    existsByRefId: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findByIdOrRefId: jest.fn(),
    findActivePincode: jest.fn(),
    findActiveCustomer: jest.fn(),
    findAllPaginated: jest.fn(),
    updateById: jest.fn(),
    softDeleteById: jest.fn(),
    searchCustomers: jest.fn(),
  };
  const usersRepository = {
    findById: jest.fn(),
    findByMobileNumber: jest.fn(),
  };
  const checkoutResolver = {
    isGokwikCheckoutEnabled: jest.fn(),
  };

  const service = new CodBlocklistService(
    repository as never,
    usersRepository as never,
    checkoutResolver as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.existsByRefId.mockResolvedValue(false);
    checkoutResolver.isGokwikCheckoutEnabled.mockResolvedValue(false);
    repository.findActivePincode.mockResolvedValue(null);
    repository.findActiveCustomer.mockResolvedValue(null);
  });

  describe('admin CRUD', () => {
    it('creates a pincode block', async () => {
      const created = pincodeEntry();
      repository.create.mockResolvedValue(created);
      repository.findById.mockResolvedValue(created);

      const result = await service.create(
        {
          type: CodBlocklistType.PINCODE,
          pincode: '380015',
          reason: 'High RTO rate',
          isActive: true,
        },
        'admin@cureka.com',
      );

      expect(result.type).toBe(CodBlocklistType.PINCODE);
      expect(result.pincode).toBe('380015');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CodBlocklistType.PINCODE,
          pincode: '380015',
          customerId: null,
          mobileNumber: null,
          isActive: true,
        }),
      );
    });

    it('creates a customer block from customerId and uses database name/mobile', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        role: UserRole.CUSTOMER,
        firstName: 'Asha',
        lastName: 'Patel',
        mobileNumber: '+919876543210',
      });
      const created = customerEntry();
      repository.create.mockResolvedValue(created);
      repository.findById.mockResolvedValue(created);

      await service.create(
        {
          type: CodBlocklistType.CUSTOMER,
          customerId: 'user-1',
          mobileNumber: '1111111111',
          reason: 'Repeated COD returns',
        },
        'admin@cureka.com',
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'user-1',
          mobileNumber: '9876543210',
          customerNameSnapshot: 'Asha Patel',
          pincode: null,
        }),
      );
    });

    it('creates a direct mobile block and attaches an existing user when found', async () => {
      usersRepository.findByMobileNumber.mockResolvedValue({
        id: 'user-9',
        firstName: 'Guest',
        lastName: 'User',
      });
      const created = customerEntry({
        id: 'cust-9',
        customerId: 'user-9',
        customerNameSnapshot: 'Guest User',
        customer: { firstName: 'Guest', lastName: 'User' },
      });
      repository.create.mockResolvedValue(created);
      repository.findById.mockResolvedValue(created);

      await service.create(
        {
          type: CodBlocklistType.CUSTOMER,
          mobileNumber: '919876543210',
        },
        'admin@cureka.com',
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'user-9',
          mobileNumber: '9876543210',
        }),
      );
    });

    it('rejects an invalid pincode', async () => {
      await expect(
        service.create(
          { type: CodBlocklistType.PINCODE, pincode: '38001' },
          'admin@cureka.com',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: COD_BLOCKLIST_INVALID_PINCODE }),
      });
    });

    it('rejects an invalid customer', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(
        service.create(
          { type: CodBlocklistType.CUSTOMER, customerId: 'missing-user' },
          'admin@cureka.com',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: COD_BLOCKLIST_INVALID_CUSTOMER }),
      });
    });

    it('rejects a duplicate active pincode', async () => {
      repository.findActivePincode.mockResolvedValue(pincodeEntry());
      await expect(
        service.create(
          { type: CodBlocklistType.PINCODE, pincode: '380015' },
          'admin@cureka.com',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.create(
          { type: CodBlocklistType.PINCODE, pincode: '380015' },
          'admin@cureka.com',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: COD_BLOCKLIST_DUPLICATE_PINCODE }),
      });
    });

    it('rejects a duplicate customer/mobile block', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        role: UserRole.CUSTOMER,
        firstName: 'Asha',
        lastName: 'Patel',
        mobileNumber: '9876543210',
      });
      repository.findActiveCustomer.mockResolvedValue(customerEntry());
      await expect(
        service.create(
          { type: CodBlocklistType.CUSTOMER, customerId: 'user-1' },
          'admin@cureka.com',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: COD_BLOCKLIST_DUPLICATE_CUSTOMER }),
      });
    });

    it('lists with pagination', async () => {
      repository.findAllPaginated.mockResolvedValue({
        data: [pincodeEntry()],
        total: 1,
      });
      const result = await service.list({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(repository.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });

    it('passes search, type, and isActive filters to the repository', async () => {
      repository.findAllPaginated.mockResolvedValue({ data: [], total: 0 });
      await service.list({
        page: 1,
        limit: 10,
        search: '380015',
        type: CodBlocklistType.PINCODE,
        isActive: true,
      });
      expect(repository.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '380015',
          type: CodBlocklistType.PINCODE,
          isActive: true,
        }),
      );
    });

    it('searches customers for the selector', async () => {
      repository.searchCustomers.mockResolvedValue({
        data: [
          {
            id: 'user-1',
            firstName: 'Asha',
            lastName: 'Patel',
            mobileNumber: '9876543210',
            email: null,
          },
        ],
        total: 1,
        blockedByUserId: new Map([['user-1', 'cust-1']]),
      });
      const result = await service.searchCustomers({ search: 'Asha', page: 1, limit: 20 });
      expect(result.data[0]?.alreadyBlocked).toBe(true);
      expect(result.data[0]?.activeBlocklistEntryId).toBe('cust-1');
    });

    it('updates reason and active status', async () => {
      repository.findByIdOrRefId
        .mockResolvedValueOnce(pincodeEntry())
        .mockResolvedValueOnce(pincodeEntry({ reason: 'Updated', isActive: false }));
      const result = await service.update(
        'pin-1',
        { reason: 'Updated', isActive: false },
        'admin@cureka.com',
      );
      expect(repository.updateById).toHaveBeenCalledWith(
        'pin-1',
        expect.objectContaining({ reason: 'Updated', isActive: false }),
      );
      expect(result.reason).toBe('Updated');
    });

    it('rejects changing type after creation', async () => {
      repository.findByIdOrRefId.mockResolvedValue(pincodeEntry());
      await expect(
        service.update(
          'pin-1',
          { type: CodBlocklistType.CUSTOMER },
          'admin@cureka.com',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: COD_BLOCKLIST_TYPE_IMMUTABLE }),
      });
    });

    it('soft-deletes an entry', async () => {
      repository.findByIdOrRefId.mockResolvedValue(pincodeEntry());
      await service.remove('pin-1');
      expect(repository.softDeleteById).toHaveBeenCalledWith('pin-1');
    });

    it('returns 404 when an entry is missing', async () => {
      repository.findByIdOrRefId.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.findOne('missing')).rejects.toMatchObject({
        response: expect.objectContaining({ code: COD_BLOCKLIST_NOT_FOUND }),
      });
    });
  });

  describe('native COD evaluation', () => {
    it('bypasses the blocklist when GoKwik checkout is active', async () => {
      checkoutResolver.isGokwikCheckoutEnabled.mockResolvedValue(true);
      repository.findActiveCustomer.mockResolvedValue(customerEntry());
      repository.findActivePincode.mockResolvedValue(pincodeEntry());

      const result = await service.evaluateCodBlock({
        customerId: 'user-1',
        pincode: '380015',
      });

      expect(result.blocked).toBe(false);
      expect(result.reasonCode).toBeNull();
      expect(repository.findActiveCustomer).not.toHaveBeenCalled();
      expect(repository.findActivePincode).not.toHaveBeenCalled();
    });

    it('blocks a native checkout for a blocked pincode', async () => {
      repository.findActivePincode.mockResolvedValue(pincodeEntry());
      const result = await service.evaluateCodBlock({ pincode: '380015' });
      expect(result).toMatchObject({
        blocked: true,
        reasonCode: CodBlockReasonCode.COD_BLOCKED_FOR_PINCODE,
        message: COD_BLOCKED_FOR_PINCODE_MESSAGE,
        matchedBy: CodBlockMatchedBy.PINCODE,
      });
    });

    it('blocks a native checkout for a blocked customer ID', async () => {
      repository.findActiveCustomer.mockResolvedValue(customerEntry());
      const result = await service.evaluateCodBlock({ customerId: 'user-1' });
      expect(result.reasonCode).toBe(CodBlockReasonCode.COD_BLOCKED_FOR_CUSTOMER);
      expect(result.message).toBe(COD_BLOCKED_FOR_CUSTOMER_MESSAGE);
    });

    it('blocks guest/native checkout by normalized mobile', async () => {
      repository.findActiveCustomer.mockResolvedValue(
        customerEntry({ customerId: null, mobileNumber: '9876543210' }),
      );
      const result = await service.evaluateCodBlock({ mobileNumber: '+919876543210' });
      expect(result.blocked).toBe(true);
      expect(repository.findActiveCustomer).toHaveBeenCalledWith({
        customerId: null,
        mobileNumber: '9876543210',
      });
    });

    it('does not block when no active entry matches', async () => {
      const result = await service.evaluateCodBlock({
        customerId: 'user-1',
        pincode: '380015',
      });
      expect(result.blocked).toBe(false);
      expect(result.reasonCode).toBeNull();
    });

    it('keeps existing min-order unavailability instead of overlaying a block', async () => {
      repository.findActivePincode.mockResolvedValue(pincodeEntry());
      const result = await service.overlayNativeCodEligibility(
        {
          available: false,
          minimumOrderAmount: 599,
          message: 'Cash on Delivery is available for orders of ₹599 or more.',
          reasonCode: 'COD_MINIMUM_ORDER_NOT_MET',
        },
        { pincode: '380015' },
      );
      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe('COD_MINIMUM_ORDER_NOT_MET');
      expect(repository.findActivePincode).not.toHaveBeenCalled();
    });

    it('overlays a pincode block onto an otherwise eligible cart', async () => {
      repository.findActivePincode.mockResolvedValue(pincodeEntry());
      const result = await service.overlayNativeCodEligibility(
        {
          available: true,
          minimumOrderAmount: 599,
          message: 'Cash on Delivery is available for orders of ₹599 or more.',
        },
        { pincode: '380015' },
      );
      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(CodBlockReasonCode.COD_BLOCKED_FOR_PINCODE);
      expect(result.message).toBe(COD_BLOCKED_FOR_PINCODE_MESSAGE);
    });

    it('rejects a direct native COD attempt for a blocked customer', async () => {
      repository.findActiveCustomer.mockResolvedValue(customerEntry());
      await expect(
        service.assertNativeCodAllowed({ customerId: 'user-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.assertNativeCodAllowed({ customerId: 'user-1' })).rejects.toMatchObject({
        response: expect.objectContaining({
          code: CodBlockReasonCode.COD_BLOCKED_FOR_CUSTOMER,
          message: COD_BLOCKED_FOR_CUSTOMER_MESSAGE,
        }),
      });
    });

    it('rejects a direct native COD attempt for a blocked pincode', async () => {
      repository.findActivePincode.mockResolvedValue(pincodeEntry());
      await expect(service.assertNativeCodAllowed({ pincode: '380015' })).rejects.toMatchObject({
        response: expect.objectContaining({
          code: CodBlockReasonCode.COD_BLOCKED_FOR_PINCODE,
        }),
      });
    });

    it('allows prepaid-style evaluation to remain unblocked when GoKwik is off and no entry matches', async () => {
      await expect(
        service.assertNativeCodAllowed({ customerId: 'user-1', pincode: '560001' }),
      ).resolves.toBeUndefined();
    });
  });
});
